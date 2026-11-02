// Browser storage, JSON export/import and share links. No server.
import LZString from 'lz-string';
import type { Crew } from './engine/model';

const KEY = 'deadgate.crews.v1';

export function loadCrews(): Crew[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as Crew[]) : [];
    return Array.isArray(list) ? list.filter(isCrew) : [];
  } catch {
    return [];
  }
}

export function saveCrews(crews: Crew[]) {
  try { localStorage.setItem(KEY, JSON.stringify(crews)); } catch { /* storage full or blocked */ }
}

export function isCrew(x: unknown): x is Crew {
  const c = x as Crew;
  return !!c && typeof c === 'object' && c.schema === 1 && typeof c.id === 'string' && Array.isArray(c.fighters) && Array.isArray(c.items);
}

export function parseCrewJson(text: string): Crew {
  const data = JSON.parse(text);
  const crew = data?.crew ?? data;
  if (!isCrew(crew)) throw new Error('This file is not a Dead Gate crew.');
  return crew;
}

export function crewToJson(crew: Crew): string {
  return JSON.stringify({ app: 'dead-gate-crew-builder', crew }, null, 2);
}

export function download(name: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Share links carry the whole crew in the URL hash, compressed. */
export const SHARE_LIMIT = 8000;
export function shareLink(crew: Crew): string | null {
  const { notes, ledger, ...rest } = crew;
  const slim = { ...rest, ledger: ledger.slice(-20), notes };
  const code = LZString.compressToEncodedURIComponent(JSON.stringify(slim));
  const url = `${location.origin}${location.pathname}#share=${code}`;
  return url.length <= SHARE_LIMIT ? url : null;
}

export function crewFromShare(hash: string): Crew | null {
  const m = hash.match(/share=([^&]+)/);
  if (!m) return null;
  try {
    const json = LZString.decompressFromEncodedURIComponent(m[1]);
    const c = json ? JSON.parse(json) : null;
    return isCrew(c) ? c : null;
  } catch {
    return null;
  }
}

export const fileName = (c: Crew) => `${(c.name || 'crew').replace(/[^\w-]+/g, '-').toLowerCase()}.deadgate.json`;
