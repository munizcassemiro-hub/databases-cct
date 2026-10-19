import { useState } from 'react';
import { Check, Plus, RotateCcw, Trash2, Undo2 } from 'lucide-react';
import type { NormalCase } from './content';
import type { Result } from './domain';

import { validateWorkshop } from './workshop-domain';
import type { DraftTable } from './workshop-domain';

export default function Workshop({ data, stage, onAttempt, onChange }: { data: NormalCase; stage: 2 | 3; onAttempt: (result: Result, answer: string) => void; onChange: () => void }) {
  const target = stage === 2 ? data.second : data.third;
  const blank = (): DraftTable[] => Array.from({ length: target.length }, () => ({ name: '', columns: [], pk: [], fk: {} }));
  const [draft, setDraft] = useState<DraftTable[]>(blank);
  const [reason, setReason] = useState('');
  const [history, setHistory] = useState<DraftTable[][]>([]);
  const columns = Object.keys(data.rows[0]);
  const update = (next: DraftTable[]) => { setHistory(h => [...h, structuredClone(draft)].slice(-30)); setDraft(next); onChange(); };
  const change = (index: number, patch: Partial<DraftTable>) => update(draft.map((t, i) => i === index ? { ...t, ...patch } : t));
  const toggle = (index: number, column: string) => {
    const t = draft[index]; const remove = t.columns.includes(column);
    change(index, { columns: remove ? t.columns.filter(c => c !== column) : [...t.columns, column], pk: remove ? t.pk.filter(c => c !== column) : t.pk, fk: remove ? Object.fromEntries(Object.entries(t.fk).filter(([c]) => c !== column)) : t.fk });
  };
  return <div className="workshop">
    <div className="workshop-tools"><span>Monte {stage}NF · {data.title}</span><div className="button-row"><button className="text-button" disabled={!history.length} onClick={() => { setDraft(history.at(-1)!); setHistory(h => h.slice(0, -1)); onChange(); }}><Undo2 size={15} /> Desfazer</button><button className="text-button" onClick={() => { update(blank()); setReason(''); }}><RotateCcw size={15} /> Limpar montagem</button></div></div>
    <p className="muted small">Clique para atribuir colunas. Um atributo pode aparecer em várias tabelas. FK: escreva <code>PARENT.coluna</code>. Os nomes pedidos aparecem na Dica 2.</p>
    <div className="builder-grid">{draft.map((t, i) => <div className="builder-table" key={i}>
      <div className="builder-name"><input aria-label={`Nome da tabela ${i + 1}`} placeholder={`Nome da tabela ${i + 1}`} value={t.name} onChange={e => change(i, { name: e.target.value })} /><button className="icon-button" aria-label={`Remover tabela ${i + 1}`} onClick={() => update(draft.filter((_, n) => n !== i))}><Trash2 size={15} /></button></div>
      <div className="column-pool">{columns.map(c => <button type="button" className={`column-chip ${t.columns.includes(c) ? 'selected' : ''}`} key={c} onClick={() => toggle(i, c)} aria-pressed={t.columns.includes(c)}>{t.columns.includes(c) && <Check size={12} />}{c}</button>)}</div>
      {t.columns.map(c => <div className="column-rules" key={c}><code>{c}</code><label><input type="checkbox" checked={t.pk.includes(c)} onChange={() => change(i, { pk: t.pk.includes(c) ? t.pk.filter(v => v !== c) : [...t.pk, c] })} /> PK</label><input aria-label={`FK de ${t.name || i + 1}.${c}`} placeholder="FK → PARENT.coluna" value={t.fk[c] ?? ''} onChange={e => change(i, { fk: { ...t.fk, [c]: e.target.value } })} /></div>)}
    </div>)}</div>
    <button className="text-button" onClick={() => update([...draft, { name: '', columns: [], pk: [], fk: {} }])}><Plus size={16} /> Adicionar tabela</button>
    <label className="input-label" htmlFor="workshop-reason">Your reason in English <span>Uma frase: qual dependência você removeu?</span></label>
    <textarea id="workshop-reason" value={reason} onChange={e => { setReason(e.target.value); onChange(); }} placeholder="… depends on …, so …" rows={3} />
    <button className="primary-button" onClick={() => onAttempt(validateWorkshop(draft, target, reason, stage, data.second === data.third), JSON.stringify({ draft, reason }))}><Check size={17} /> Verificar minha montagem</button>
  </div>;
}
