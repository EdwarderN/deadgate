// Browser storage, JSON export/import and share links. No server.
import LZString from 'lz-string';
import { z } from 'zod';
import type { Crew } from './engine/model';

const KEY = 'deadgate.crews.v1';

/** Bring a crew saved under older rules up to the current shape (the roster's rumour note is now a lead, 14.8). */
export function migrateCrew(c: Crew): Crew {
  const notes = c.notes as Crew['notes'] & { rumour?: string };
  if (notes && notes.lead === undefined) {
    const { rumour, ...rest } = notes;
    return { ...c, notes: { ...rest, lead: rumour ?? '' } };
  }
  return c;
}

export function loadCrews(): Crew[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as Crew[]) : [];
    return Array.isArray(list) ? list.filter(isStoredCrew).map(migrateCrew) : [];
  } catch {
    return [];
  }
}

export function saveCrews(crews: Crew[]) {
  try { localStorage.setItem(KEY, JSON.stringify(crews)); } catch { /* storage full or blocked */ }
}

// Crews from a share link or a file come from someone else: check their shape and size
// before the app touches them. Text is shown by React (never as HTML); colours go through safeColour.
const MAX_TEXT = 4000; // longest single text field
const MAX_LIST = 500; // longest list (fighters, items, log lines...)
const MAX_DEPTH = 12;
export const MAX_CREW_BYTES = 1_000_000;

const ID = z.string().regex(/^[\w-]{1,64}$/);
const shortText = z.string().max(200);
const CrewShape = z.object({
  schema: z.literal(1),
  id: ID,
  rulesVersion: shortText,
  name: shortText,
  tape: shortText,
  faction: shortText.nullable(),
  subfaction: shortText.nullable(),
  captainId: ID.nullable(),
  fighters: z.array(z.object({ id: ID, name: z.string().max(MAX_TEXT) }).passthrough()).max(MAX_LIST),
  items: z.array(z.object({ uid: ID, itemId: z.string().max(MAX_TEXT), fighterId: ID.nullable() }).passthrough()).max(MAX_LIST),
  phase: z.enum(['creation', 'campaign']),
  step: z.number().int().min(0).max(100),
  parts: z.number().finite(),
  ledger: z.array(z.unknown()).max(5000),
}).passthrough();

/** Every string, list and nesting level within bounds (nothing that could freeze or bloat the app). */
function withinLimits(x: unknown, depth = 0): boolean {
  if (depth > MAX_DEPTH) return false;
  if (typeof x === 'string') return x.length <= MAX_TEXT;
  if (typeof x === 'number') return Number.isFinite(x);
  if (x === null || typeof x === 'boolean') return true;
  if (Array.isArray(x)) return x.length <= 5000 && x.every((v) => withinLimits(v, depth + 1));
  if (typeof x === 'object') {
    const keys = Object.keys(x as object);
    return keys.length <= MAX_LIST && keys.every((k) => k.length <= 200 && k !== '__proto__' && k !== 'constructor' && k !== 'prototype' && withinLimits((x as Record<string, unknown>)[k], depth + 1));
  }
  return false;
}

/** Crews already on this device: a light check, so a crew is never dropped for growing long. */
function isStoredCrew(x: unknown): x is Crew {
  const c = x as Crew;
  return !!c && typeof c === 'object' && c.schema === 1 && typeof c.id === 'string' && Array.isArray(c.fighters) && Array.isArray(c.items);
}

export function isCrew(x: unknown): x is Crew {
  return CrewShape.safeParse(x).success && withinLimits(x);
}

/** A colour safe to put in a style: #hex or a plain colour word, nothing else (no url(), no expressions). */
export function safeColour(c: string | null | undefined): string | undefined {
  if (!c) return undefined;
  const v = c.trim().toLowerCase();
  if (/^#[0-9a-f]{3,8}$/.test(v)) return v;
  if (/^[a-z]{3,20}$/.test(v)) return v;
  return undefined;
}

export function parseCrewJson(text: string): Crew {
  if (text.length > MAX_CREW_BYTES) throw new Error('This file is too big to be a Dead Gate crew.');
  const data = JSON.parse(text);
  const crew = data?.crew ?? data;
  if (!isCrew(crew)) throw new Error('This file is not a Dead Gate crew.');
  return migrateCrew(crew);
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
  if (!m || m[1].length > SHARE_LIMIT * 2) return null;
  try {
    const json = LZString.decompressFromEncodedURIComponent(m[1]);
    if (!json || json.length > MAX_CREW_BYTES) return null;
    const c = JSON.parse(json);
    return isCrew(c) ? migrateCrew(c) : null;
  } catch {
    return null;
  }
}

export const fileName = (c: Crew) => `${(c.name || 'crew').replace(/[^\w-]+/g, '-').toLowerCase()}.deadgate.json`;
