import { useState } from 'react';
import { ArrowRight, Check, CheckCircle2, ChevronDown, Code2, Lightbulb, RotateCcw, Send, Sparkles, TriangleAlert } from 'lucide-react';
import { normalCases } from './content';
import { checkKey } from './domain';
import type { Progress, Result } from './domain';
import type { Exercise } from './exercises';
import { solution } from './exercises';
import { evaluateSQL, selectPreview, sqlTasks } from './sql';
import Workshop from './workshop';
import { Code, DataTable, SchemaCards } from './ui';

export default function ExerciseCard({ exercise: ex, number, total, progress, translate, onAttempt, onNext }: { exercise: Exercise; number: number; total: number; progress: Progress; translate: boolean; onAttempt: (id: string, result: Result, answer: string) => void; onNext: () => void }) {
  const sql = ex.sqlTask ?? sqlTasks.find(s => s.id === ex.sqlId);
  const [selected, setSelected] = useState<string[]>([]);
  const [assigned, setAssigned] = useState<Record<string, string>>({});
  const [text, setText] = useState(sql?.starter ?? '');
  const [hint, setHint] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const [translation, setTranslation] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [collisions, setCollisions] = useState<number[]>([]);
  const [retry, setRetry] = useState(0);
  const normal = normalCases.find(c => c.id === ex.caseId);
  const change = () => { setResult(null); setCollisions([]); };
  const attempt = (r: Result, answer: string) => { setResult(r); onAttempt(ex.id, r, answer); };
  const submit = () => {
    if (ex.type === 'key') { const r = checkKey(ex.rows!, selected, ex.candidates); setCollisions(r.collisions.flat()); attempt(r, selected.join(', ')); }
    else if (ex.type === 'choice') {
      if (!selected.length) { setResult({ correct: false, message: 'Escolha uma resposta para testar sua ideia.' }); return; }
      const correct = JSON.stringify([...selected].sort()) === JSON.stringify([...(ex.correct ?? [])].sort());
      attempt({ correct, message: correct ? `Isso! ${ex.explanation}` : `Vamos revisar essa escolha. ${ex.explanation}` }, selected.join(' | '));
    } else if (ex.type === 'assign') {
      const empty = Object.keys(ex.assignments!).find(k => !assigned[k]);
      if (empty) { setResult({ correct: false, message: `Falta classificar: ${empty}. Escolha uma opção em cada linha.` }); return; }
      const wrong = Object.entries(ex.assignments!).find(([k, v]) => assigned[k] !== v);
      attempt({ correct: !wrong, message: wrong ? `Revise “${wrong[0]}”: você escolheu “${assigned[wrong[0]]}”. ${ex.explanation}` : `Todas as associações conferem. ${ex.explanation}` }, JSON.stringify(assigned));
    } else if (ex.type === 'atomic') {
      const clean = (value: string) => value.trim().toLowerCase().replace(/[()\s]/g, '');
      const actual = text.split('\n').map(clean).filter(Boolean).sort();
      const expected = ex.expectedLines!.map(clean).sort();
      const correct = JSON.stringify(actual) === JSON.stringify(expected);
      attempt({ correct, message: correct ? `Perfeito: uma associação por linha, uma coisa por célula. ${ex.explanation}` : 'Ainda há uma associação faltando, repetida ou com mais de um curso na célula. Escreva StudentID,CourseID, um par por linha; confira também os IDs.' }, text);
    } else if (ex.type === 'reason') {
      const lower = text.toLowerCase(); const correct = text.trim().length >= 25 && ex.rubric!.every(group => group.some(word => lower.includes(word)));
      attempt({ correct, message: correct ? 'Sua frase inclui os critérios essenciais: atributo, determinante e dependência parcial. Compare agora sua redação com a resolução; esta correção por critérios não avalia toda a linguagem.' : 'Sua frase precisa identificar StudentName, StudentID e explicar que a dependência usa só parte da chave composta. Escreva em inglês usando “depends only on” ou “partial dependency”.' }, text);
    } else if (ex.type === 'sql') attempt(evaluateSQL(text, sql!.model), text);
  };
  const reset = () => { setSelected([]); setAssigned({}); setText(sql?.starter ?? ''); setResult(null); setCollisions([]); setShowSolution(false); setHint(0); setRetry(v => v + 1); };
  return <article className="exercise-card" id="practice">
    <div className="exercise-top"><span className="section-eyebrow"><Sparkles size={15} /> AGORA, É COM VOCÊ</span><span className="exercise-count">{String(number).padStart(2, '0')} <span>/ {total}</span></span></div>
    <div className="exercise-heading"><h2>{ex.title}</h2>{progress.attempts[ex.id]?.correct && <span className="status-tag"><CheckCircle2 size={14} /> Resolvido</span>}</div>
    <p className="exercise-prompt" lang="en">{ex.prompt}</p>
    {translate || translation ? <p className="translation">{ex.translation}</p> : <button className="text-button small" onClick={() => setTranslation(true)}>EN → PT · Mostrar tradução</button>}
    {ex.scenario && <div className="constraint-scenario"><DataTable rows={ex.scenario.rows} caption={ex.scenario.table} /><p className="input-note">Regras deste cenário: {ex.scenario.rules}</p><Code code={ex.scenario.code} /></div>}
    {ex.type === 'key' && <><p className="input-note">Clique nos cabeçalhos para propor sua chave. Você pode selecionar várias colunas.</p><DataTable rows={ex.rows!} selected={selected} onSelect={c => { setSelected(s => s.includes(c) ? s.filter(v => v !== c) : [...s, c]); change(); }} highlights={collisions} caption="Key Detective · clique nas colunas" /><div className="key-selection"><span>SUA CHAVE</span><code>{selected.length ? selected.join(' + ') : 'Selecione uma ou mais colunas…'}</code></div></>}
    {ex.type === 'choice' && <div className="choices" role="group" aria-label="Opções de resposta"><p className="input-note">{ex.correct!.length > 1 ? 'Selecione todas as respostas corretas.' : 'Selecione uma resposta.'}</p>{ex.options?.map((option, i) => <button key={option} className={`choice ${selected.includes(option) ? 'selected' : ''}`} aria-pressed={selected.includes(option)} onClick={() => { setSelected(s => ex.correct!.length > 1 ? s.includes(option) ? s.filter(v => v !== option) : [...s, option] : [option]); change(); }}><span className="choice-letter">{String.fromCharCode(65 + i)}</span><span lang="en">{option}</span>{selected.includes(option) && <Check size={17} />}</button>)}</div>}
    {ex.type === 'assign' && <div className="assignments">{Object.keys(ex.assignments!).map((k, i) => <div className="assignment" key={k}><label htmlFor={`${ex.id}-${i}`}>{k}</label><select id={`${ex.id}-${i}`} value={assigned[k] ?? ''} onChange={e => { setAssigned(a => ({ ...a, [k]: e.target.value })); change(); }}><option value="">Escolha…</option>{ex.choices?.map(c => <option key={c}>{c}</option>)}</select></div>)}</div>}
    {ex.type === 'atomic' && <><div className="unf-source"><span>ORIGEM · UNF</span><code>{ex.source}</code></div><label className="input-label" htmlFor={`${ex.id}-answer`}>Suas linhas em 1NF</label><textarea id={`${ex.id}-answer`} className="code-input" placeholder="StudentID,CourseID" rows={5} value={text} onChange={e => { setText(e.target.value); change(); }} /></>}
    {ex.type === 'reason' && <textarea aria-label="Sua justificativa em inglês" placeholder="StudentName depends…" value={text} rows={4} onChange={e => { setText(e.target.value); change(); }} />}
    {ex.type === 'sql' && <><div className="sql-context"><Code2 size={16} /><span>{sql?.variant ? 'VARIANTE B · enrollment_id é PK' : 'RESPOSTA ESCRITA · MYSQL'}</span><span>Ctrl + Enter para verificar</span></div><div className="editor"><div className="editor-numbers" aria-hidden="true">{Array.from({ length: Math.max(7, text.split('\n').length) }, (_, i) => <span key={i}>{i + 1}</span>)}</div><textarea spellCheck={false} aria-label="Editor SQL" placeholder="-- Escreva seu SQL aqui, do zero…" value={text} rows={Math.max(7, text.split('\n').length)} onChange={e => { setText(e.target.value); change(); }} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); submit(); } if (e.key === 'Tab') { e.preventDefault(); const start = e.currentTarget.selectionStart; const end = e.currentTarget.selectionEnd; setText(text.slice(0, start) + '  ' + text.slice(end)); change(); const field = e.currentTarget; requestAnimationFrame(() => { field.selectionStart = field.selectionEnd = start + 2; }); } }} /></div><p className="validation-note">Validação educacional de estrutura SQL — não executa no MySQL. Aceita variações de caixa, espaços, ordem das definições CREATE e ; opcional. O escopo é o comando simples pedido.</p></>}
    {ex.type === 'workshop' && normal && <><DataTable rows={normal.rows} caption={`Fonte em 1NF · ${normal.title}`} /><div className="dependency-list">{normal.dependencies.map(d => <code key={d}>{d}</code>)}</div><Workshop key={`${ex.id}-${retry}`} data={normal} stage={ex.stage!} onAttempt={attempt} onChange={change} /></>}
    {ex.type !== 'workshop' && <div className="exercise-actions"><button className="primary-button" onClick={submit}><Send size={16} /> Verificar resposta</button><button className="text-button" onClick={reset}><RotateCcw size={15} /> Tentar novamente</button></div>}
    {result && <div className={`feedback ${result.correct ? 'success' : 'needs-work'}`} role="status">{result.correct ? <CheckCircle2 size={21} /> : <TriangleAlert size={21} />}<div><strong>{result.correct ? 'Boa! Você entendeu a ideia.' : 'Quase lá. Vamos entender o motivo.'}</strong><p>{result.message}</p>{result.correct && ex.type === 'sql' && <><p>{ex.explanation}</p>{selectPreview(text) !== null && <><span className="small">Prévia determinística · amostra local fixa</span><DataTable rows={selectPreview(text)!} /></>}</>}{ex.type === 'workshop' && <button className="text-button" onClick={reset}><RotateCcw size={15} /> Tentar novamente</button>}</div></div>}
    <div className="exercise-help"><div className="button-row"><button className="hint-button" disabled={hint >= ex.hints.length} onClick={() => setHint(h => h + 1)}><Lightbulb size={15} />{hint >= ex.hints.length ? 'Dicas abertas' : `Dica ${hint + 1}`}</button><button className="text-button" aria-expanded={showSolution} onClick={() => setShowSolution(v => !v)}><ChevronDown size={15} />{showSolution ? 'Fechar resolução' : 'Ver resolução comentada'}</button></div><button className="next-button" onClick={onNext}>Próximo exercício <ArrowRight size={16} /></button></div>
    {hint > 0 && <div className="hint-list">{ex.hints.slice(0, hint).map((h, i) => <p key={h}><strong>Dica {i + 1}</strong> {h}</p>)}</div>}
    {showSolution && <div className="model-answer"><span className="section-eyebrow">RESOLUÇÃO COMENTADA · LEIA O RACIOCÍNIO</span>{ex.type === 'workshop' && normal ? <><SchemaCards tables={ex.stage === 2 ? normal.second : normal.third} rows={normal.rows} /><p lang="en">{ex.explanation}</p></> : ex.type === 'sql' ? <><Code code={solution(ex)} /><p>{ex.explanation}</p></> : <p className="preserve-lines">{solution(ex)}</p>}<p className="muted small">Ler a resolução não conta como acerto. Feche, tente de novo e explique para si o motivo.</p></div>}
  </article>;
}
