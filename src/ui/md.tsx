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
