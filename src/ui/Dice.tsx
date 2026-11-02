// Roll in the app, or roll real dice and type the result in.
import { useState } from 'react';
import { getRules } from '../data/rules';
import { d6, d66, isD66, rollPool, twoD6, type PoolRoll } from '../engine/dice';

export type Die = 'd6' | '2d6' | 'd66';
const RANGE: Record<Die, [number, number]> = { d6: [1, 6], '2d6': [2, 12], d66: [11, 66] };
const valid = (die: Die, n: number) => (die === 'd66' ? isD66(n) : n >= RANGE[die][0] && n <= RANGE[die][1]);
export const rollDie = (die: Die) => (die === 'd6' ? d6() : die === '2d6' ? twoD6() : d66());

/** A Roll button plus a box to type a real roll. Calls onResult with the number. */
export function RollOrEnter({ die, label, onResult, disabled, value }: { die: Die; label?: string; onResult: (n: number, rolled: boolean) => void; disabled?: boolean; value?: number | null }) {
  const [typed, setTyped] = useState('');
  const [err, setErr] = useState('');
  const submit = () => {
    const n = parseInt(typed, 10);
    if (!valid(die, n)) { setErr(die === 'd66' ? 'Two digits, each 1 to 6 (e.g. 35)' : `${RANGE[die][0]} to ${RANGE[die][1]}`); return; }
    setErr(''); setTyped(''); onResult(n, false);
  };
  return (
    <div className="roll-or-enter">
      <button type="button" className="btn small primary" disabled={disabled} onClick={() => onResult(rollDie(die), true)}>🎲 {label ?? `Roll ${die}`}</button>
      <span className="muted small">or real dice:</span>
      <input className="num die-input" inputMode="numeric" aria-label={`Enter your ${die} roll`} placeholder={die} value={typed} disabled={disabled}
        onChange={(e) => setTyped(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
      <button type="button" className="btn small" disabled={disabled || !typed} onClick={submit}>Enter</button>
      {value != null && <span className="die-result" aria-live="polite">{value}</span>}
      {err && <span className="err-text small">{err}</span>}
    </div>
  );
}

/** A test or attack roll: 2d6 with extra or missing dice, keep two (3.2). Or type the kept total. */
export function PoolRoller({ initialExtra = 0, target, onResult, label }: { initialExtra?: number; target?: number | null; onResult?: (total: number, kept: number[] | null) => void; label?: string }) {
  const rules = getRules();
  const cap = rules.crew.dice.netEdgeCap.value;
  const bad = rules.crew.dice.badKeptTotal.value;
  const [extra, setExtra] = useState(initialExtra);
  const [res, setRes] = useState<PoolRoll | { total: number; kept: null } | null>(null);
  const [typed, setTyped] = useState('');
  const done = (r: PoolRoll | { total: number; kept: null }) => { setRes(r); onResult?.(r.total, r.kept); };
  return (
    <div className="pool">
      <div className="row gap-s wrap">
        {label && <strong className="small">{label}</strong>}
        <span className="small">Dice:</span>
        <button type="button" className="btn small" aria-label="One die fewer" onClick={() => setExtra(Math.max(-cap, extra - 1))}>−</button>
        <span className="pool-extra" aria-live="polite">{extra === 0 ? '2d6' : extra > 0 ? `2d6 +${extra} (keep best 2)` : `2d6 ${extra} (keep lowest 2)`}</span>
        <button type="button" className="btn small" aria-label="One die more" onClick={() => setExtra(Math.min(cap, extra + 1))}>+</button>
        {target != null && <span className="badge">needs {target}+</span>}
      </div>
      <div className="row gap-s wrap">
        <button type="button" className="btn small primary" onClick={() => done(rollPool(extra, cap))}>🎲 Roll</button>
        <span className="muted small">or kept total:</span>
        <input className="num die-input" inputMode="numeric" aria-label="Enter the kept total" placeholder="2-12" value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D/g, ''))} />
        <button type="button" className="btn small" disabled={!typed} onClick={() => { const n = +typed; if (n >= 2 && n <= 12) { done({ total: n, kept: null }); setTyped(''); } }}>Enter</button>
      </div>
      {res && (
        <p className="pool-result" aria-live="polite">
          {'dice' in res && <span className="muted small">[{res.dice.join(' ')}] keep {res.kept.join('+')} = </span>}
          <strong>{res.total}</strong>
          {target != null && (res.total >= target ? <span className="badge ok">Success</span> : <span className="badge err">Failure</span>)}
          {res.total <= bad && <span className="badge warn">Kept {res.total}: {bad} or less (3.5)</span>}
        </p>
      )}
    </div>
  );
}
