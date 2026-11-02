// Dice and table lookups (chapter 3). Every roll can also be entered by hand,
// so players can use real dice: the app only needs the numbers.
export type Rng = () => number;
export const d6 = (rng: Rng = Math.random) => 1 + Math.floor(rng() * 6);
export const d66 = (rng: Rng = Math.random) => d6(rng) * 10 + d6(rng);
export const twoD6 = (rng: Rng = Math.random) => d6(rng) + d6(rng);

export interface PoolRoll { dice: number[]; kept: number[]; total: number; extra: number }

/** 2d6 with extra (best two kept) or missing (lowest two kept) dice, capped at the net edge cap (3.2). */
export function rollPool(extra: number, cap: number, rng: Rng = Math.random): PoolRoll {
  const net = Math.max(-cap, Math.min(cap, extra));
  const dice = Array.from({ length: 2 + Math.abs(net) }, () => d6(rng));
  const sorted = [...dice].sort((a, b) => b - a);
  const kept = net >= 0 ? sorted.slice(0, 2) : sorted.slice(-2);
  return { dice, kept, total: kept[0] + kept[1], extra: net };
}

/** Does a table cell like "11-16", "24-26, 31-32", "2" or "6" cover n? */
export function cellCovers(cell: string, n: number): boolean {
  return cell.split(',').some((part) => {
    const m = part.trim().match(/^(\d+)\s*(?:[-–]\s*(\d+))?$/);
    if (!m) return false;
    const lo = +m[1];
    const hi = m[2] ? +m[2] : lo;
    return n >= lo && n <= hi;
  });
}

/** The row of a d6, 2d6 or d66 table whose first column covers n. */
export function lookup<T extends Record<string, string>>(rows: T[], n: number, col?: string): T | undefined {
  const key = col ?? Object.keys(rows[0] ?? {})[0];
  return rows.find((r) => cellCovers(r[key] ?? '', n));
}

/** Is n a value a d66 can show (both digits 1 to 6)? */
export const isD66 = (n: number) => n >= 11 && n <= 66 && n % 10 >= 1 && n % 10 <= 6;

/** Severity from a shot total or melee margin (3.4): reads the "Margin | Severity" table. */
export function severityOfMargin(rows: { Margin: string; Severity: string }[], margin: number): string | null {
  for (const r of rows) {
    const m = r.Margin.match(/(\d+)(?:\s*(?:to|or)\s*(\d+|more))?/);
    if (!m) continue;
    const lo = +m[1];
    const hi = m[2] === 'more' || !m[2] ? (m[2] === 'more' ? Infinity : lo) : +m[2];
    if (margin >= lo && margin <= hi) return r.Severity.replace(/\*\*/g, '');
  }
  return null;
}
