import { Fragment } from 'react';

/** Render the book's markdown bold (**word**) as bold, nothing more. */
export function Md({ text }: { text: string }) {
  const parts = text.split(/(\*\*.+?\*\*)/g);
  return (
    <>
      {parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>))}
    </>
  );
}

const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
const isRule = (line: string) => /^\s*\|?\s*:?-{2,}/.test(line);

/** Text with line breaks, "- " bullets and the book's markdown tables, shown as real tables. */
export function MdBlock({ text }: { text: string }) {
  const lines = text.split('\n');
  const out: JSX.Element[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('|')) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++]);
      i--;
      const [head, ...rest] = rows;
      const body = rest.filter((r) => !isRule(r));
      out.push(
        <div key={i} className="table-wrap">
          <table className="md-table">
            <thead><tr>{cells(head).map((c, k) => <th key={k} scope="col"><Md text={c} /></th>)}</tr></thead>
            <tbody>{body.map((r, j) => <tr key={j}>{cells(r).map((c, k) => <td key={k}><Md text={c} /></td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
    } else if (line.trim()) out.push(<div key={i}><Md text={line.replace(/^\s*- /, '• ')} /></div>);
  }
  return <>{out}</>;
}
