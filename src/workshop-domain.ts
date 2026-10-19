import type { TableSchema } from './content';
import type { Result } from './domain';

export interface DraftTable { name: string; columns: string[]; pk: string[]; fk: Record<string, string> }
export function validateWorkshop(draft: DraftTable[], target: TableSchema[], reason: string, stage: 2 | 3, already3NF: boolean): Result {
  if (draft.length !== target.length) return { correct: false, message: `Revise a decomposição: este estágio usa ${target.length} tabelas. Não crie tabelas sem uma dependência que justifique a separação.` };
  const clean = (s: string) => s.trim().toLowerCase();
  for (const table of target) {
    const actual = draft.find(t => clean(t.name) === clean(table.name));
    if (!actual) return { correct: false, message: `Falta uma tabela chamada ${table.name}. Use os nomes desta atividade para conseguirmos conferir suas referências.` };
    const equal = (a: string[], b: string[]) => JSON.stringify(a.map(clean).sort()) === JSON.stringify(b.map(clean).sort());
    if (!equal(actual.columns, table.columns)) return { correct: false, message: `Revise as colunas de ${table.name}. Pense no que a chave dessa tabela determina; a associação mantém as referências e os atributos da chave inteira.` };
    if (!equal(actual.pk, table.pk)) return { correct: false, message: `A PK de ${table.name} ainda não identifica corretamente cada linha. Uma chave composta precisa de todas as suas partes.` };
    const actualRefs = Object.entries(actual.fk).filter(([, v]) => v.trim()).map(([k, v]) => `${clean(k)}:${clean(v)}`).sort();
    const targetRefs = Object.entries(table.fk).map(([k, v]) => `${clean(k)}:${clean(v)}`).sort();
    if (JSON.stringify(actualRefs) !== JSON.stringify(targetRefs)) return { correct: false, message: `Revise as FKs de ${table.name}. Cada referência usa PARENT.coluna e pode coexistir com uma parte da PK.` };
  }
  const text = reason.toLowerCase();
  if (reason.trim().length < 25 || !/depend|already|normal form/.test(text)) return { correct: false, message: 'A estrutura está correta! Agora justifique em uma frase em inglês: diga quais atributos dependem de qual chave. Ex.: “X depends on Y, so …”. A redação é conferida por critérios, não por um corretor de linguagem.' };
  if (stage === 2 && !/partial|part of|whole|full/.test(text)) return { correct: false, message: 'Sua estrutura está correta. Na justificativa de 2NF, mencione partial dependency ou a dependência da chave inteira (full/whole key).' };
  if (stage === 3 && !/transitive/.test(text)) return { correct: false, message: 'Sua estrutura está correta. Na justificativa de 3NF, explique a presença ou ausência de transitive dependencies.' };
  if (already3NF && stage === 3 && !/no |not |already|without/.test(text)) return { correct: false, message: 'Neste caso, as tabelas de 2NF já são 3NF. Explique que não há dependência transitiva sob as regras fornecidas.' };
  return { correct: true, message: 'Tabelas, colunas, PKs e FKs conferem! A justificativa inclui os critérios essenciais; compare seu raciocínio com a resolução comentada.' };
}
