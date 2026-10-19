export type Topic = 'basics' | 'keys' | 'normalisation' | 'sql' | 'constraints';
export type Page = 'home' | 'learn' | 'keys' | 'normalisation' | 'sql' | 'constraints' | 'mistakes' | 'review';
export type Row = Record<string, string | number | null>;
export interface Result { correct: boolean; message: string }

export function collisions(rows: Row[], columns: string[]): number[][] {
  const groups = new Map<string, number[]>();
  rows.forEach((row, i) => {
    const key = JSON.stringify(columns.map(c => row[c]));
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });
  return [...groups.values()].filter(g => g.length > 1);
}

export function checkKey(rows: Row[], columns: string[], candidateKeys?: string[][]): Result & { collisions: number[][] } {
  if (!columns.length) return { correct: false, message: 'Selecione pelo menos uma coluna para propor uma chave.', collisions: [] };
  const missing = rows.flatMap((r, i) => columns.some(c => r[c] === null || r[c] === undefined) ? [i + 1] : []);
  if (missing.length) return { correct: false, message: `Uma Primary Key não pode conter NULL. Confira a(s) linha(s) ${missing.join(', ')}.`, collisions: [] };
  const duplicates = collisions(rows, columns);
  if (duplicates.length) return { correct: false, message: `Há colisão: as linhas ${duplicates.map(g => g.map(i => i + 1).join(' e ')).join('; ')} têm a mesma combinação. Ela não identifica cada registro. Acrescente o atributo que distingue essas ocorrências.`, collisions: duplicates };
  // Business-rule candidate keys avoid treating an accidentally unique sample date as a key.
  if (candidateKeys) {
    const contained = candidateKeys.find(key => key.every(c => columns.includes(c)));
    if (!contained) return { correct: false, message: 'Os valores são únicos nesta amostra, mas a escolha não garante identidade pelas regras informadas. Use os identificadores declarados; datas ou nomes isolados podem se repetir em novos registros.', collisions: [] };
    if (contained.length < columns.length) return { correct: false, message: `Única, mas não mínima: é uma Super Key. ${contained.join(' + ')} já basta; remova as colunas desnecessárias.`, collisions: [] };
  } else if (columns.some(c => collisions(rows, columns.filter(v => v !== c)).length === 0)) {
    return { correct: false, message: 'Única, mas não mínima: uma coluna pode ser removida sem perder unicidade. Isso é uma Super Key; procure a Candidate Key mínima.', collisions: [] };
  }
  return { correct: true, message: 'Isso! A combinação é única, não contém NULL e é mínima sob as regras deste exercício. Cada parte é necessária para identificar a linha.', collisions: [] };
}

export type Dependency = { determinant: string[]; dependent: string; via?: string };
export function classifyDependency(key: string[], dependency: Dependency): 'full' | 'partial' | 'transitive' {
  if (dependency.via) return 'transitive';
  if (dependency.determinant.length < key.length && dependency.determinant.every(c => key.includes(c))) return 'partial';
  return 'full';
}

export interface Attempt { count: number; correct: boolean; lastAnswer: string; lastAt: string; failures: number }
export interface Progress { version: 1; completed: string[]; bookmarks: string[]; attempts: Record<string, Attempt>; lastPage: Page; lastLesson?: string }
export const STORAGE_KEY = 'database-lab.progress.v1';
export const emptyProgress = (): Progress => ({ version: 1, completed: [], bookmarks: [], attempts: {}, lastPage: 'learn' });
const pages: Page[] = ['home', 'learn', 'keys', 'normalisation', 'sql', 'constraints', 'mistakes', 'review'];
export function loadProgress(storage?: Pick<Storage, 'getItem'>): Progress {
  try {
    // Accessing the localStorage property itself can throw in sandboxed previews.
    const availableStorage = storage ?? globalThis.localStorage;
    const raw = JSON.parse(availableStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!raw || raw.version !== 1 || !Array.isArray(raw.completed) || !Array.isArray(raw.bookmarks) || !raw.attempts || typeof raw.attempts !== 'object') return emptyProgress();
    const attempts: Record<string, Attempt> = {};
    for (const [id, a] of Object.entries(raw.attempts)) {
      if (a && typeof a === 'object' && 'count' in a && 'correct' in a && 'lastAnswer' in a && 'lastAt' in a && 'failures' in a && typeof a.count === 'number' && typeof a.correct === 'boolean' && typeof a.lastAnswer === 'string' && typeof a.lastAt === 'string' && typeof a.failures === 'number') attempts[id] = a as Attempt;
    }
    return { ...emptyProgress(), completed: raw.completed.filter((x: unknown) => typeof x === 'string'), bookmarks: raw.bookmarks.filter((x: unknown) => typeof x === 'string'), attempts, lastPage: pages.includes(raw.lastPage) ? raw.lastPage : 'learn', lastLesson: typeof raw.lastLesson === 'string' ? raw.lastLesson : undefined };
  } catch { return emptyProgress(); }
}
export function initializeProgress(storage?: Pick<Storage, 'getItem'>): { progress: Progress; storageReadable: boolean } {
  try {
    const availableStorage = storage ?? globalThis.localStorage;
    const serialized = availableStorage.getItem(STORAGE_KEY);
    return { progress: loadProgress({ getItem: () => serialized }), storageReadable: true };
  } catch {
    // Never overwrite existing progress if reading it was temporarily denied.
    return { progress: emptyProgress(), storageReadable: false };
  }
}
export function recordAttempt(progress: Progress, id: string, correct: boolean, answer: string): Progress {
  const previous = progress.attempts[id];
  return { ...progress, attempts: { ...progress.attempts, [id]: { count: (previous?.count ?? 0) + 1, correct, lastAnswer: answer, lastAt: new Date().toISOString(), failures: (previous?.failures ?? 0) + (correct ? 0 : 1) } } };
}
export function mistakeIds(progress: Progress): string[] { return Object.keys(progress.attempts).filter(id => !progress.attempts[id].correct); }
export function mastery(progress: Progress, ids: string[]): number { return ids.length ? Math.round(ids.filter(id => progress.attempts[id]?.correct).length / ids.length * 100) : 0; }
