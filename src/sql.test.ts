import { describe, expect, it } from 'vitest';
import { evaluateSQL, parseSQL, selectPreview, sqlTasks } from './sql';
import { exercises, variation } from './exercises';

describe('task-specific SQL parser and evaluator', () => {
  for (const task of sqlTasks) {
    it(`accepts the complete model for ${task.id}: ${task.title}`, () => expect(evaluateSQL(task.model, task.model).correct).toBe(true));
    it(`accepts harmless whitespace and keyword case for ${task.id}`, () => {
      const variant = task.model.replace(/\b(CREATE|TABLE|SELECT|FROM|INSERT|INTO|ALTER|UPDATE|WHERE|SET|USE|DATABASE|ORDER|BY|DESC|VALUES)\b/g, s => s.toLowerCase()).replace(/,\s*/g, ',\n  ').replace(/;$/, '');
      expect(evaluateSQL(variant, task.model).correct).toBe(true);
    });
  }
  it('rejects a valid UPDATE that lacks the required WHERE', () => {
    const result = evaluateSQL("UPDATE students SET city = 'Cork';", sqlTasks[9].model);
    expect(result.correct).toBe(false); expect(result.message).toContain('Faltou WHERE');
  });
  it('distinguishes ALTER and UPDATE', () => expect(evaluateSQL("UPDATE students SET city = 'Cork' WHERE student_id = 1;", sqlTasks[6].model).message).toContain('ALTER'));
  it('requires a complete statement, not matching keywords', () => {
    for (const input of ['SELECT FROM students WHERE Dublin', '-- SELECT first_name, city FROM students WHERE city = \'Dublin\';', 'SELECT first_name city FROM students', 'WHERE SELECT FROM']) expect(evaluateSQL(input, sqlTasks[11].model).correct).toBe(false);
  });
  it('rejects extra statements and extra trailing tokens', () => {
    expect(evaluateSQL('SELECT * FROM students; SELECT * FROM students;', sqlTasks[10].model).correct).toBe(false);
    expect(evaluateSQL('SELECT * FROM students nonsense', sqlTasks[10].model).correct).toBe(false);
  });
  it('preserves string case and numeric versus text values', () => {
    expect(evaluateSQL("SELECT first_name, city FROM students WHERE city = 'dublin';", sqlTasks[11].model).correct).toBe(false);
    expect(evaluateSQL("UPDATE students SET city = 'Cork' WHERE student_id = '1';", sqlTasks[9].model).correct).toBe(false);
  });
  it('rejects wrong tables, columns, conditions and sort direction', () => {
    expect(evaluateSQL('SELECT * FROM courses;', sqlTasks[10].model).correct).toBe(false);
    expect(evaluateSQL('SELECT first_name FROM students;', sqlTasks[10].model).correct).toBe(false);
    expect(evaluateSQL("UPDATE students SET city = 'Cork' WHERE student_id = 2;", sqlTasks[9].model).correct).toBe(false);
    expect(evaluateSQL('SELECT course_code, fee FROM courses ORDER BY fee ASC;', sqlTasks[12].model).correct).toBe(false);
  });
  it('accepts ADD COLUMN, optional semicolons and quoted identifiers', () => expect(evaluateSQL('alter table `students` add column `phone_number` varchar(20)', sqlTasks[6].model).correct).toBe(true));
  it('accepts reordered CREATE column definitions and a table-level PK', () => {
    expect(evaluateSQL('CREATE TABLE CUSTOMER (Name VARCHAR(50) NOT NULL, CustomerNumber VARCHAR(4), PRIMARY KEY(CustomerNumber));', sqlTasks[23].model).correct).toBe(true);
  });
  it('accepts INSERT column/value pairs reordered together', () => expect(evaluateSQL("INSERT INTO MEMBERS(MemberName,MemberID) VALUES('Nora Kelly','I06')", sqlTasks[16].model).correct).toBe(true));
  it('does not accept CREATE with wrong types or incomplete constraints', () => {
    expect(evaluateSQL(sqlTasks[23].model.replace('VARCHAR(4)', 'INT'), sqlTasks[23].model).correct).toBe(false);
    expect(evaluateSQL(sqlTasks[3].model.replace('CHECK (fee >= 0)', ''), sqlTasks[3].model).correct).toBe(false);
    expect(evaluateSQL(sqlTasks[4].model.replace('FOREIGN KEY (student_id) REFERENCES', 'FOREIGN KEY (course_id) REFERENCES'), sqlTasks[4].model).correct).toBe(false);
  });
  it('rejects unquoted text, missing REFERENCES, wrong precision and trailing commas', () => {
    expect(evaluateSQL("INSERT INTO MEMBERS (MemberID,MemberName) VALUES(I06,'Nora Kelly')", sqlTasks[16].model).correct).toBe(false);
    expect(evaluateSQL(sqlTasks[4].model.replace('REFERENCES students', 'students'), sqlTasks[4].model).correct).toBe(false);
    expect(() => parseSQL('CREATE TABLE x (v DECIMAL(2,8))')).toThrow('escala');
    expect(() => parseSQL('CREATE TABLE x (id INT,)')).toThrow('vírgula');
  });
  it('distinguishes the separate surrogate-key variant', () => {
    expect(evaluateSQL('ALTER TABLE enrollments RENAME COLUMN status TO is_active', sqlTasks[13].model).correct).toBe(false);
    expect(evaluateSQL(sqlTasks[4].model.replace('PRIMARY KEY (student_id, course_id)', 'enrollment_id INT PRIMARY KEY'), sqlTasks[4].model).correct).toBe(false);
  });
});

describe('deterministic SELECT previews', () => {
  it('projects and filters the actual local sample', () => expect(selectPreview(sqlTasks[11].model)).toEqual([{ first_name: 'Ana', city: 'Dublin' }, { first_name: 'Bruno', city: 'Dublin' }]));
  it('sorts numeric fees descending', () => expect(selectPreview(sqlTasks[12].model)?.map(r => r.fee)).toEqual([400, 250, 180]));
  it('supports the library sample and numeric WHERE', () => {
    expect(selectPreview(sqlTasks[19].model)).toEqual([{ memberid: 'I02', membername: 'Sara Ali' }]);
    expect(selectPreview(sqlTasks[22].model)).toHaveLength(2);
  });
  it('never presents INSERT or ALTER as executed', () => { expect(selectPreview(sqlTasks[5].model)).toBeNull(); expect(selectPreview(sqlTasks[6].model)).toBeNull(); });
});

describe('mistake queue SQL variations', () => {
  for (const ex of exercises.filter(e => e.type === 'sql')) {
    it(`provides a complete, valid alternative command for ${ex.id}`, () => {
      const variant = variation(ex);
      expect(variant.sqlTask).toBeDefined();
      const task = variant.sqlTask!;
      expect(evaluateSQL(task.model, task.model).correct).toBe(true);
      expect(task.model).not.toBe(sqlTasks.find(s => s.id === ex.sqlId)!.model);
      expect(evaluateSQL(sqlTasks.find(s => s.id === ex.sqlId)!.model, task.model).correct).toBe(false);
    });
  }
});
