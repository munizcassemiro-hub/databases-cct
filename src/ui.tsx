import { useState } from 'react';
import { ArrowRight, Bookmark, BookOpen, Check, ChevronDown, Lightbulb, X } from 'lucide-react';
import { glossary } from './content';
import type { Lesson, TableSchema } from './content';
import type { Row } from './domain';

export function Code({ code }: { code: string }) {
  const tokens = code.split(/('[^']*'|\b(?:CREATE|DATABASE|IF|NOT|EXISTS|USE|TABLE|INT|AUTO_INCREMENT|PRIMARY|KEY|VARCHAR|NULL|UNIQUE|DEFAULT|CHECK|BETWEEN|AND|DECIMAL|FOREIGN|REFERENCES|INSERT|INTO|VALUES|ALTER|ADD|MODIFY|DROP|COLUMN|UPDATE|SET|WHERE|SELECT|FROM|ORDER|BY|DESC|RENAME|TO|BOOLEAN|TRUE)\b|\b\d+\b)/gi);
  return <pre className="code-block"><code>{tokens.map((t, i) => <span key={i} className={t.startsWith("'") ? 'code-string' : /^\d+$/.test(t) ? 'code-number' : /^[A-Z_]+$/.test(t) ? 'code-keyword' : ''}>{t}</span>)}</code></pre>;
}

export function DataTable({ rows, selected, onSelect, highlights = [], caption }: { rows: Row[]; selected?: string[]; onSelect?: (column: string) => void; highlights?: number[]; caption?: string }) {
  if (!rows.length) return <div className="empty-result">Nenhuma linha nesta amostra corresponde à condição.</div>;
  const columns = Object.keys(rows[0]);
  return <div className="table-scroll" tabIndex={0} role="region" aria-label={caption ?? 'Tabela de dados, role para ver todas as colunas'}><table><caption>{caption}</caption><thead><tr><th className="row-number">#</th>{columns.map(c => <th key={c} className={selected?.includes(c) ? 'column-selected' : ''}>{onSelect ? <button onClick={() => onSelect(c)} aria-pressed={selected?.includes(c)}>{selected?.includes(c) && <Check size={13} />}{c}</button> : c}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i} className={highlights.includes(i) ? 'collision-row' : ''}><td className="row-number">{i + 1}</td>{columns.map(c => <td className={selected?.includes(c) ? 'column-selected' : ''} key={c}>{row[c] === null ? <span className="null-value">NULL</span> : String(row[c])}</td>)}</tr>)}</tbody></table></div>;
}

export function SchemaCards({ tables, rows }: { tables: TableSchema[]; rows?: Row[] }) {
  return <div className="schema-grid">{tables.map(t => {
    const unique = rows ? [...new Map(rows.map(r => { const values = Object.fromEntries(t.columns.map(c => [c, r[c]])); return [JSON.stringify(values), values]; })).values()] : [];
    return <div className="schema-card" key={t.name}><div className="schema-title"><BookOpen size={15} />{t.name}</div>{t.columns.map(c => <div className="schema-column" key={c}><code>{c}</code><span>{t.pk.includes(c) && <b className="pk-tag">PK</b>}{t.fk[c] && <b className="fk-tag" title={`→ ${t.fk[c]}`}>FK</b>}</span></div>)}{Object.entries(t.fk).map(([c, target]) => <p className="reference" key={c}>{c} → {target}</p>)}{rows && <details className="sample-details"><summary>Ver {unique.length} registros</summary><DataTable rows={unique} /></details>}</div>;
  })}</div>;
}

export function LessonCard({ lesson, done, saved, onComplete, onBookmark }: { lesson: Lesson; done: boolean; saved: boolean; onComplete: () => void; onBookmark: () => void }) {
  const [other, setOther] = useState(false);
  return <article className="lesson-card">
    <div className="section-eyebrow"><BookOpen size={15} /> PRIMEIRO, ENTENDA <button className={`icon-button ${saved ? 'bookmarked' : ''}`} onClick={onBookmark} aria-label={saved ? 'Remover favorito' : 'Salvar lição'} aria-pressed={saved}><Bookmark size={18} fill={saved ? 'currentColor' : 'none'} /></button></div>
    <h2>{lesson.title}</h2><p className="english-terms">{lesson.english}</p><p className="lesson-text">{lesson.explanation}</p>
    <div className="analogy"><Lightbulb size={19} /><div><strong>Pensa assim…</strong><p>{lesson.analogy}</p></div></div>
    <div className="before-after"><div><span className="label-before">ANTES</span><p>{lesson.before}</p></div><ArrowRight size={20} className="before-arrow" /><div><span className="label-after">DEPOIS</span><p>{lesson.after}</p></div></div>
    {lesson.code && <Code code={lesson.code} />}
    <button className="text-button" aria-expanded={other} onClick={() => setOther(v => !v)}><ChevronDown size={16} className={other ? 'rotated' : ''} /> Me explica de outro jeito</button>
    {other && <p className="alternative">{lesson.alternative}</p>}
    <div className="lesson-footer"><p><strong>Leve com você:</strong> {lesson.takeaway}</p><button className={done ? 'secondary-button done-button' : 'secondary-button'} onClick={onComplete}><Check size={16} />{done ? 'Lição concluída' : 'Entendi esta lição'}</button></div>
  </article>;
}

export function Glossary({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState(''); const [selected, setSelected] = useState('');
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-labelledby="glossary-title" className="modal glossary-modal" onKeyDown={e => { if (e.key === 'Escape') onClose(); }}><div className="modal-header"><div><span className="section-eyebrow">PALAVRAS QUE FAZEM SENTIDO</span><h2 id="glossary-title">Glossário <span>EN ↔ PT</span></h2></div><button className="icon-button" aria-label="Fechar glossário" onClick={onClose}><X /></button></div><input autoFocus aria-label="Buscar termo no glossário" placeholder="Busque um termo em inglês ou português…" value={query} onChange={e => setQuery(e.target.value)} /><div className="glossary-list">{glossary.filter(g => g.join(' ').toLowerCase().includes(query.toLowerCase())).map(([en, pt, definition]) => <button className={`glossary-term ${selected === en ? 'expanded' : ''}`} key={en} aria-expanded={selected === en} onClick={() => setSelected(selected === en ? '' : en)}><span><strong>{en}</strong><span>{pt}</span></span><ChevronDown size={16} />{selected === en && <p>{definition}</p>}</button>)}{!glossary.some(g => g.join(' ').toLowerCase().includes(query.toLowerCase())) && <p className="muted">Nenhum termo encontrado. Tente “key” ou “chave”.</p>}</div></section></div>;
}
