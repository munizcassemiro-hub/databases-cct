import type { Result, Row } from './domain';
import { courseRows, libraryRows, studentRows } from './content';

type Token = { kind: 'word' | 'literal' | 'number' | 'symbol'; text: string };
type Node = Record<string, unknown>;
export interface SqlTask { id: string; title: string; prompt: string; translation: string; model: string; hint: string[]; explanation: string; starter?: string; variant?: boolean }

function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < sql.length) {
    const rest = sql.slice(i);
    const space = rest.match(/^\s+/); if (space) { i += space[0].length; continue; }
    if (rest.startsWith('--')) { const end = rest.indexOf('\n'); i += end < 0 ? rest.length : end; continue; }
    if (rest.startsWith('/*')) { const end = rest.indexOf('*/', 2); if (end < 0) throw Error('Comentário /* sem fechamento */.'); i += end + 2; continue; }
    const char = sql[i];
    if (char === "'" || char === '"' || char === '`') {
      const quote = char; let value = ''; let closed = false; i++;
      while (i < sql.length) {
        if (sql[i] === quote) { if (sql[i + 1] === quote) { value += quote; i += 2; } else { i++; closed = true; break; } }
        else value += sql[i++];
      }
      if (!closed) throw Error('Faltou fechar as aspas do texto ou identificador.');
      tokens.push({ kind: quote === '`' ? 'word' : 'literal', text: quote === '`' ? value.toLowerCase() : value }); continue;
    }
    const word = rest.match(/^[a-zA-Z_][a-zA-Z_0-9]*/);
    if (word) { tokens.push({ kind: 'word', text: word[0].toLowerCase() }); i += word[0].length; continue; }
    const number = rest.match(/^-?\d+(?:\.\d+)?/);
    if (number) { tokens.push({ kind: 'number', text: String(Number(number[0])) }); i += number[0].length; continue; }
    const symbol = rest.match(/^(>=|<=|<>|!=|[(),;*=<>])/);
    if (symbol) { tokens.push({ kind: 'symbol', text: symbol[0] }); i += symbol[0].length; continue; }
    throw Error(`Caractere não suportado nesta prática: ${char}. Use SQL simples, sem JOINs ou expressões avançadas.`);
  }
  if (tokens.at(-1)?.text === ';') tokens.pop();
  if (tokens.some(t => t.text === ';')) throw Error('Envie uma única instrução por exercício.');
  return tokens;
}

class Reader {
  index = 0;
  constructor(public tokens: Token[]) {}
  peek() { return this.tokens[this.index]?.text; }
  take(expected?: string) {
    const token = this.tokens[this.index++];
    if (!token) throw Error(`Comando incompleto${expected ? `: falta ${expected.toUpperCase()}` : ''}.`);
    if (expected && token.text !== expected) throw Error(`Esperado ${expected.toUpperCase()}, mas encontrei ${token.text}.`);
    return token;
  }
  optional(text: string) { if (this.peek() === text) { this.index++; return true; } return false; }
  identifier() { const t = this.take(); if (t.kind !== 'word') throw Error('Era esperado um nome de tabela ou coluna.'); return t.text; }
  value() { const t = this.take(); if (t.kind === 'literal') return { value: t.text, kind: 'text' }; if (t.kind === 'number') return { value: Number(t.text), kind: 'number' }; if (['null', 'true', 'false'].includes(t.text)) return { value: t.text, kind: 'keyword' }; throw Error(`O valor ${t.text} precisa de aspas se for texto ou data. Números são escritos sem aspas.`); }
  names() { this.take('('); const names = [this.identifier()]; while (this.optional(',')) names.push(this.identifier()); this.take(')'); if (new Set(names).size !== names.length) throw Error('Há uma coluna repetida na lista.'); return names; }
  type() {
    let type = this.identifier(); if (type === 'integer') type = 'int'; if (type === 'numeric') type = 'decimal';
    if (!['int', 'varchar', 'date', 'decimal', 'boolean', 'timestamp', 'tinyint'].includes(type)) throw Error(`${type.toUpperCase()} não é um tipo suportado aqui. Use INT, VARCHAR, DATE, DECIMAL, BOOLEAN ou TIMESTAMP.`);
    const dimensions: number[] = [];
    if (this.optional('(')) {
      const t = this.take(); if (t.kind !== 'number' || !/^\d+$/.test(t.text)) throw Error('O tamanho/precisão precisa ser um inteiro positivo.'); dimensions.push(Number(t.text));
      if (this.optional(',')) { const scale = this.take(); if (scale.kind !== 'number' || !/^\d+$/.test(scale.text)) throw Error('A escala precisa ser um inteiro.'); dimensions.push(Number(scale.text)); }
      this.take(')');
    }
    if (type === 'varchar' && (dimensions.length !== 1 || dimensions[0] < 1)) throw Error('VARCHAR precisa de tamanho, como VARCHAR(50).');
    if (type === 'decimal' && (dimensions.length !== 2 || dimensions[0] < 1 || dimensions[1] > dimensions[0])) throw Error('Use DECIMAL(precisão, escala), com escala menor ou igual à precisão.');
    return { type, dimensions };
  }
  condition() {
    const column = this.identifier();
    if (this.optional('between')) { const low = this.value(); this.take('and'); return { column, op: 'between', low, high: this.value() }; }
    const op = this.take().text;
    if (!['=', '>=', '<=', '>', '<', '<>', '!='].includes(op)) throw Error('Use uma comparação válida: =, >=, <=, >, < ou BETWEEN.');
    return { column, op: op === '!=' ? '<>' : op, value: this.value() };
  }
  check() { this.take('('); const expression = this.condition(); this.take(')'); return expression; }
  references() { this.take('references'); const table = this.identifier(); return { table, refColumns: this.names() }; }
  done() { if (this.index !== this.tokens.length) throw Error(`Trecho inesperado: ${this.tokens.slice(this.index).map(t => t.text).join(' ')}. Confira a ordem das cláusulas e as vírgulas.`); }
}

export function parseSQL(sql: string): Node {
  const r = new Reader(tokenize(sql));
  if (!r.tokens.length) throw Error('Escreva seu comando antes de verificar.');
  const verb = r.identifier(); let node: Node;
  if (verb === 'create' && r.optional('database')) {
    let ifNotExists = false; if (r.optional('if')) { r.take('not'); r.take('exists'); ifNotExists = true; }
    node = { verb, object: 'database', name: r.identifier(), ifNotExists };
  } else if (verb === 'use') node = { verb, name: r.identifier() };
  else if (verb === 'create') {
    r.take('table'); const name = r.identifier(); r.take('(');
    const columns: Node[] = []; const constraints: Node[] = [];
    do {
      if (r.optional('primary')) { r.take('key'); constraints.push({ kind: 'pk', columns: r.names().sort() }); }
      else if (r.optional('foreign')) { r.take('key'); const fields = r.names(); constraints.push({ kind: 'fk', columns: fields, ...r.references() }); }
      else if (r.optional('unique')) constraints.push({ kind: 'unique', columns: r.names().sort() });
      else if (r.optional('check')) constraints.push({ kind: 'check', expression: r.check() });
      else {
        const column = r.identifier(); const type = r.type(); const definition: Node = { name: column, ...type, nullable: true, auto: false };
        while (r.peek() && ![',', ')'].includes(r.peek()!)) {
          if (r.optional('not')) { r.take('null'); definition.nullable = false; }
          else if (r.optional('null')) definition.nullable = true;
          else if (r.optional('auto_increment')) definition.auto = true;
          else if (r.optional('primary')) { r.take('key'); constraints.push({ kind: 'pk', columns: [column] }); }
          else if (r.optional('unique')) { r.optional('key'); constraints.push({ kind: 'unique', columns: [column] }); }
          else if (r.optional('default')) definition.default = r.value();
          else if (r.optional('check')) constraints.push({ kind: 'check', expression: r.check() });
          else if (r.peek() === 'references') constraints.push({ kind: 'fk', columns: [column], ...r.references() });
          else throw Error(`Regra não reconhecida em ${column}: ${r.peek()}. FOREIGN KEY precisa de REFERENCES table(column).`);
        }
        columns.push(definition);
      }
      if (r.peek() === ',') { r.take(','); if (r.peek() === ')') throw Error('Remova a vírgula antes do último parêntese.'); } else break;
    } while (r.peek() !== ')');
    r.take(')');
    if (!columns.length || new Set(columns.map(c => c.name)).size !== columns.length) throw Error('A tabela precisa de colunas com nomes distintos.');
    if (constraints.filter(c => c.kind === 'pk').length > 1) throw Error('Uma tabela tem uma única PRIMARY KEY constraint. Para chave composta, agrupe as colunas na mesma definição.');
    const primary = constraints.find(c => c.kind === 'pk');
    if (primary) columns.forEach(c => { if ((primary.columns as string[]).includes(c.name as string)) c.nullable = false; });
    node = { verb, object: 'table', name, columns: columns.sort((a, b) => String(a.name).localeCompare(String(b.name))), constraints: constraints.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) };
  } else if (verb === 'insert') {
    r.take('into'); const name = r.identifier(); const columns = r.names(); r.take('values'); r.take('('); const values = [r.value()]; while (r.optional(',')) values.push(r.value()); r.take(')');
    if (values.length !== columns.length) throw Error('O número de VALUES deve corresponder ao número de colunas, na mesma ordem.');
    node = { verb, name, values: Object.fromEntries(columns.map((c, i) => [c, values[i]]).sort(([a], [b]) => String(a).localeCompare(String(b)))) };
  } else if (verb === 'alter') {
    r.take('table'); const name = r.identifier(); const action = r.identifier();
    if (['add', 'modify'].includes(action)) { r.optional('column'); node = { verb, name, action, column: r.identifier(), ...r.type() }; }
    else if (action === 'drop') { r.optional('column'); node = { verb, name, action, column: r.identifier() }; }
    else if (action === 'rename') { r.take('column'); const column = r.identifier(); r.take('to'); node = { verb, name, action, column, to: r.identifier() }; }
    else throw Error('Nesta prática, ALTER TABLE usa ADD, MODIFY, DROP COLUMN ou RENAME COLUMN ... TO.');
  } else if (verb === 'update') {
    const name = r.identifier(); r.take('set'); const values: Node = {};
    do { const column = r.identifier(); r.take('='); if (column in values) throw Error('Uma coluna aparece duas vezes em SET.'); values[column] = r.value(); } while (r.optional(','));
    const where = r.optional('where') ? r.condition() : null; node = { verb, name, values: Object.fromEntries(Object.entries(values).sort()), where };
  } else if (verb === 'select') {
    const columns: string[] = [];
    if (r.optional('*')) columns.push('*'); else { columns.push(r.identifier()); while (r.optional(',')) columns.push(r.identifier()); }
    r.take('from'); const name = r.identifier(); const where = r.optional('where') ? r.condition() : null;
    let order = null; if (r.optional('order')) { r.take('by'); const column = r.identifier(); const direction = r.optional('desc') ? 'desc' : (r.optional('asc'), 'asc'); order = { column, direction }; }
    node = { verb, name, columns, where, order };
  } else throw Error('Use CREATE, USE, INSERT, ALTER, UPDATE ou SELECT. Cada exercício informa qual operação escrever.');
  r.done(); return node;
}

export function evaluateSQL(input: string, model: string): Result {
  try {
    const actual = parseSQL(input); const expected = parseSQL(model);
    if (actual.verb !== expected.verb) return { correct: false, message: `O objetivo pede ${String(expected.verb).toUpperCase()}. ALTER muda a estrutura; UPDATE muda valores; INSERT adiciona linhas; SELECT consulta.` };
    if (expected.where && !actual.where) return { correct: false, message: 'Faltou WHERE para limitar as linhas. Em UPDATE, sem essa condição, todos os registros podem ser alterados.' };
    if (actual.name !== expected.name) return { correct: false, message: `Confira a tabela ou database: este exercício usa ${expected.name}. A variante com enrollment_id é separada da variante de chave composta.` };
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      if (actual.verb === 'create') return { correct: false, message: 'A estrutura é legível, mas não corresponde ao pedido. Confira nomes, tipos e tamanhos, PK, NOT NULL, UNIQUE, DEFAULT, CHECK e as referências FK. Todos os campos e regras solicitados precisam estar presentes.' };
      if (actual.verb === 'alter') return { correct: false, message: 'Confira a ação (ADD, MODIFY, DROP ou RENAME), o nome da coluna e seu tipo/tamanho. ALTER modifica a estrutura indicada no enunciado.' };
      if (JSON.stringify(actual.where) !== JSON.stringify(expected.where)) return { correct: false, message: 'A condição WHERE não corresponde ao alvo pedido. Confira coluna, operador, valor e aspas. A condição precisa selecionar exatamente os registros solicitados.' };
      if (actual.verb === 'select') return { correct: false, message: 'Confira a lista de colunas e ORDER BY. WHERE filtra linhas; SELECT escolhe colunas; DESC ordena do maior para o menor.' };
      return { correct: false, message: 'Confira as colunas e cada valor solicitado. Textos/datas precisam de aspas; números, de tipo numérico. VALUES segue a ordem da lista de colunas.' };
    }
    return { correct: true, message: 'Muito bem! O comando expressa a estrutura e o efeito pedidos. Maiúsculas/minúsculas, espaços e o ponto e vírgula opcional não mudam esta resposta.' };
  } catch (e) { return { correct: false, message: e instanceof Error ? e.message : 'Confira a estrutura do comando.' }; }
}

export function selectPreview(sql: string): Row[] | null {
  try {
    const node = parseSQL(sql); if (node.verb !== 'select') return null;
    const datasets: Record<string, Row[]> = { students: studentRows, courses: courseRows, members: libraryRows.map(r => ({ MemberID: r.MemberID, MemberName: r.MemberName })) };
    let rows = [...(datasets[String(node.name)] ?? [])];
    if (node.where) {
      const w = node.where as { column: string; op: string; value: { value: string | number } };
      rows = rows.filter(row => { const key = Object.keys(row).find(k => k.toLowerCase() === w.column); const value = key ? row[key] : null; return w.op === '=' ? value === w.value.value : w.op === '>=' ? Number(value) >= Number(w.value.value) : w.op === '>' ? Number(value) > Number(w.value.value) : false; });
    }
    if (node.order) { const order = node.order as { column: string; direction: string }; rows.sort((a, b) => { const av = a[order.column]; const bv = b[order.column]; return (typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))) * (order.direction === 'desc' ? -1 : 1); }); }
    if ((node.columns as string[])[0] !== '*') rows = rows.map(row => Object.fromEntries((node.columns as string[]).map(c => [c, row[Object.keys(row).find(k => k.toLowerCase() === c) ?? c]])));
    return rows;
  } catch { return null; }
}

const task = (id: string, title: string, prompt: string, translation: string, model: string, explanation: string, hint: string[], starter?: string, variant?: boolean): SqlTask => ({ id, title, prompt, translation, model, explanation, hint, starter, variant });
export const sqlTasks: SqlTask[] = [
  task('s01', 'Criar um database', 'Create the school database only if it does not already exist.', 'Crie o database school somente se ainda não existir.', 'CREATE DATABASE IF NOT EXISTS school;', 'IF NOT EXISTS evita erro se o database já existir. Nenhuma tabela é criada por este comando.', ['Comece com CREATE DATABASE.', 'Use IF NOT EXISTS antes de school.']),
  task('s02', 'Escolher o database', 'Select school as the current database.', 'Escolha school como database atual.', 'USE school;', 'USE define o contexto para os próximos comandos.', ['É uma instrução curta, com USE.', 'USE seguido do nome do database.']),
  task('s03', 'Tabela students', 'Create students: student_id INT AUTO_INCREMENT PK; first_name and last_name VARCHAR(50) NOT NULL; email VARCHAR(100) NOT NULL UNIQUE; city VARCHAR(50) DEFAULT Dublin.', 'Crie students com os campos e regras descritos. Dublin é um valor textual.', "CREATE TABLE students (student_id INT AUTO_INCREMENT PRIMARY KEY, first_name VARCHAR(50) NOT NULL, last_name VARCHAR(50) NOT NULL, email VARCHAR(100) NOT NULL UNIQUE, city VARCHAR(50) DEFAULT 'Dublin');", 'Cada coluna define nome, tipo e regras. AUTO_INCREMENT gera o ID; UNIQUE protege o e-mail; DEFAULT vale para city omitida.', ['Use CREATE TABLE students (...) e vírgulas entre definições.', "city VARCHAR(50) DEFAULT 'Dublin'; a PK fica em student_id."]),
  task('s04', 'Tabela courses', 'Create courses: course_id INT AUTO_INCREMENT PK; course_code VARCHAR(10) NOT NULL UNIQUE; course_name VARCHAR(100) NOT NULL; credits INT NOT NULL CHECK 1–30; fee DECIMAL(8,2) NOT NULL CHECK fee >= 0.', 'Crie courses; use BETWEEN 1 AND 30 para credits e fee >= 0 para a taxa.', 'CREATE TABLE courses (course_id INT AUTO_INCREMENT PRIMARY KEY, course_code VARCHAR(10) NOT NULL UNIQUE, course_name VARCHAR(100) NOT NULL, credits INT NOT NULL CHECK (credits BETWEEN 1 AND 30), fee DECIMAL(8,2) NOT NULL CHECK (fee >= 0));', 'DECIMAL(8,2) tem oito dígitos totais; CHECK restringe o domínio além do tipo.', ['CHECK recebe uma condição entre parênteses.', 'credits usa BETWEEN 1 AND 30; fee usa >= 0.']),
  task('s05', 'PK composta + duas FKs', 'Create enrollments: student_id INT NOT NULL, course_id INT NOT NULL, grade DECIMAL(5,2). Use a composite PK and FKs to students(student_id) and courses(course_id).', 'Crie a variante com PK composta. Não adicione enrollment_id.', 'CREATE TABLE enrollments (student_id INT NOT NULL, course_id INT NOT NULL, grade DECIMAL(5,2), PRIMARY KEY (student_id, course_id), FOREIGN KEY (student_id) REFERENCES students(student_id), FOREIGN KEY (course_id) REFERENCES courses(course_id));', 'Há uma única PK constraint com duas colunas. Cada parte também é FK, mas grade não faz parte da chave.', ['PRIMARY KEY (student_id, course_id) fica dentro da definição.', 'FOREIGN KEY (coluna) REFERENCES parent(coluna).']),
  task('s06', 'Inserir Ana', "Insert Ana Silva, ana@example.com, Dublin into students. Omit the generated ID.", 'Insira os quatro valores sem informar student_id.', "INSERT INTO students (first_name,last_name,email,city) VALUES ('Ana','Silva','ana@example.com','Dublin');", 'A ordem dos valores acompanha a ordem das colunas. O ID é gerado.', ['Liste as quatro colunas após INSERT INTO students.', 'VALUES recebe os quatro textos entre aspas.']),
  task('s07', 'Adicionar uma coluna', 'Add phone_number VARCHAR(20) to students.', 'Adicione a coluna phone_number com até 20 caracteres.', 'ALTER TABLE students ADD phone_number VARCHAR(20);', 'ADD altera o schema; não atualiza valores em linhas.', ['A operação é ALTER TABLE, não UPDATE.', 'Use ADD antes do nome e do tipo.']),
  task('s08', 'Aumentar o tamanho', 'Change phone_number to VARCHAR(30) in students. Assume it already exists.', 'Altere o tipo da coluna existente para VARCHAR(30).', 'ALTER TABLE students MODIFY phone_number VARCHAR(30);', 'No MySQL, MODIFY redefine o tipo de uma coluna existente.', ['Use ALTER TABLE students MODIFY.', 'Informe o nome phone_number e o novo tipo VARCHAR(30).']),
  task('s09', 'Remover uma coluna', 'Remove phone_number from students.', 'Remova a coluna phone_number e seus valores.', 'ALTER TABLE students DROP COLUMN phone_number;', 'DROP COLUMN remove estrutura e os dados dessa coluna; não apaga a tabela inteira.', ['Use ALTER TABLE, pois é estrutura.', 'DROP COLUMN seguido de phone_number.']),
  task('s10', 'Atualizar uma linha', "Set city to Cork for student_id 1 only.", 'Atualize apenas o estudante 1.', "UPDATE students SET city = 'Cork' WHERE student_id = 1;", 'WHERE protege as outras linhas. SET define o novo valor.', ['UPDATE students SET ...', 'Não esqueça WHERE student_id = 1.']),
  task('s11', 'Consultar tudo', 'Retrieve all columns and rows from students.', 'Selecione todas as colunas e linhas de students.', 'SELECT * FROM students;', '* representa todas as colunas. Sem WHERE, todas as linhas são retornadas.', ['Use SELECT com asterisco.', 'FROM indica students.']),
  task('s12', 'Filtrar Dublin', "Retrieve first_name and city from students where city is Dublin.", 'Mostre apenas first_name e city dos estudantes de Dublin.', "SELECT first_name, city FROM students WHERE city = 'Dublin';", 'SELECT escolhe colunas, WHERE escolhe linhas. A prévia usa os três estudantes da amostra.', ['As duas colunas ficam entre SELECT e FROM.', "city = 'Dublin' é a condição WHERE."]),
  task('s13', 'Ordenar por preço', 'Retrieve course_code and fee from courses, highest fee first.', 'Mostre código e taxa, do maior valor para o menor.', 'SELECT course_code, fee FROM courses ORDER BY fee DESC;', 'DESC dá ordem decrescente. ORDER BY não filtra registros.', ['ORDER BY vem depois de FROM courses.', 'Use fee DESC para maior primeiro.']),
  task('s14', 'Renomear: variante separada', 'Alternative schema only: enrollments(enrollment_id INT AUTO_INCREMENT PK, student_id FK, course_id FK, status1 BOOLEAN, semester VARCHAR(20), grade DECIMAL(5,2)). Rename existing status1 to is_active.', 'Somente nesta variante, status1 existe. Renomeie para is_active sem mudar seus valores.', 'ALTER TABLE enrollments RENAME COLUMN status1 TO is_active;', 'Esta é uma variante separada, com enrollment_id como PK. Não adicione status1 à tabela de PK composta do exercício anterior.', ['ALTER TABLE enrollments RENAME COLUMN ...', 'status1 TO is_active.'], undefined, true),
  task('s15', 'UPDATE na variante alternativa', 'Alternative schema after the rename: set is_active to TRUE for enrollment_id 7.', 'Na variante com ID gerado, ative somente a matrícula 7.', 'UPDATE enrollments SET is_active = TRUE WHERE enrollment_id = 7;', 'BOOLEAN é tratado como TINYINT(1) no MySQL. Esta variante tem enrollment_id e is_active, após o RENAME.', ['Use UPDATE, SET e WHERE.', 'Filtre enrollment_id = 7, não student_id.'], undefined, true),
  task('s16', 'Corrigir o risco', "Repair this command: set only student 2 to Galway, preserving all other cities.", 'Corrija o comando para atingir apenas student_id 2.', "UPDATE students SET city = 'Galway' WHERE student_id = 2;", 'O erro inicial é a ausência de WHERE; SQL válido também pode produzir efeito indesejado.', ['O comando inicial afeta todos.', 'Acrescente WHERE student_id = 2.'], "UPDATE students SET city = 'Galway';"),
  task('s17', 'INSERT na biblioteca', "Insert member I06 named Nora Kelly into MEMBERS(MemberID, MemberName).", 'Insira o novo membro na tabela final normalizada.', "INSERT INTO MEMBERS (MemberID, MemberName) VALUES ('I06', 'Nora Kelly');", 'Os identificadores da biblioteca são texto, então I06 usa aspas.', ['Use INSERT INTO MEMBERS, com as duas colunas.', 'I06 e Nora Kelly são valores textuais.']),
  task('s18', 'ALTER na biblioteca', 'Add phone VARCHAR(20) to MEMBERS.', 'Adicione um telefone opcional à tabela MEMBERS.', 'ALTER TABLE MEMBERS ADD phone VARCHAR(20);', 'Esse exercício de alteração acontece depois da normalização; phone é um novo requisito, não uma coluna inventada na tabela original.', ['ALTER altera a estrutura.', 'ADD phone VARCHAR(20).']),
  task('s19', 'UPDATE na biblioteca', "Change MemberName to John Santos only for MemberID I01.", 'Mude o nome apenas do membro I01.', "UPDATE MEMBERS SET MemberName = 'John Santos' WHERE MemberID = 'I01';", 'O identificador I01 também precisa de aspas; o filtro preserva os demais membros.', ['SET muda MemberName.', "WHERE MemberID = 'I01'."]),
  task('s20', 'SELECT na biblioteca', "Retrieve MemberID and MemberName from MEMBERS where MemberID is I02.", 'Selecione código e nome somente do membro I02.', "SELECT MemberID, MemberName FROM MEMBERS WHERE MemberID = 'I02';", 'O resultado esperado é I02, Sara Ali.', ['Escolha as duas colunas após SELECT.', "Use FROM MEMBERS WHERE MemberID = 'I02'."]),
  task('s21', 'Corrigir tipo e aspas', "Repair the INSERT to add course CS02, Networks, 5 credits and a numeric fee of 120.", 'Corrija os tipos: código/nome são texto e créditos/taxa são números.', "INSERT INTO courses (course_code,course_name,credits,fee) VALUES ('CS02','Networks',5,120);", 'Identificadores textuais sem aspas não são valores literais. A taxa solicitada é numérica.', ['CS02 e Networks precisam de aspas.', '5 e 120 são números, sem aspas.'], "INSERT INTO courses (course_code,course_name,credits,fee) VALUES (CS02,Networks,'5','120');"),
  task('s22', 'Inserir uma associação', 'Assume student 1 and course 2 already exist, and their pair is not enrolled. Insert grade 75 into composite-key enrollments.', 'Insira a matrícula (1, 2) com nota 75 na variante de PK composta.', 'INSERT INTO enrollments (student_id,course_id,grade) VALUES (1,2,75);', 'Os parents precisam existir. A hipótese deste exercício usa uma nova tabela, onde esse par ainda não foi inserido.', ['Liste student_id, course_id, grade.', 'VALUES (1,2,75).']),
  task('s23', 'Filtrar uma taxa', 'Retrieve course_code and fee for courses with fee >= 250.', 'Mostre código e taxa somente quando fee for maior ou igual a 250.', 'SELECT course_code, fee FROM courses WHERE fee >= 250;', 'Comparações numéricas não precisam de aspas.', ['O operador é >=.', 'WHERE fee >= 250 vem depois de FROM courses.']),
  task('s24', 'Preservar zero inicial', "Create CUSTOMER with CustomerNumber VARCHAR(4) PRIMARY KEY and Name VARCHAR(50) NOT NULL.", 'Use texto para preservar IDs como 0123, sem convertê-los em 123.', 'CREATE TABLE CUSTOMER (CustomerNumber VARCHAR(4) PRIMARY KEY, Name VARCHAR(50) NOT NULL);', 'VARCHAR(4) preserva os zeros iniciais de CustomerNumber; INT não preserva a forma textual.', ['CREATE TABLE CUSTOMER (...).', 'CustomerNumber é VARCHAR(4), não INT.']),
];
