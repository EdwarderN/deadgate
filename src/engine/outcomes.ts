// Reading what a table result asks for, and applying it to the crew.
// A result's text is the book's own; this reads the parts, XP, statuses, states,
// tags, contacts and silly traits it names, so the player ticks instead of typing.
import { plain, type Rules } from '../data/rules';
import { statusForWord } from './battle';
import { addLedger, isBot } from './crew';
import { uid, type Crew, type Fighter } from './model';

export type Change =
  | { kind: 'parts'; amount: number; note: string }
  | { kind: 'xp'; fid: string; amount: number; note: string }
  | { kind: 'status'; fid: string; value: string }
  | { kind: 'injury'; fid: string; value: string; title: string | null }
  | { kind: 'legend'; fid: string; name: string; title: string | null }
  | { kind: 'silly'; fid: string; value: string | null }
  | { kind: 'tag'; value: string }
  | { kind: 'contact'; value: string }
  | { kind: 'rival'; value: string }
  | { kind: 'nextBattle'; fid: string; value: string }
  | { kind: 'leave'; fid: string; fate: string; note: string };

/** An outcome read from text: a change that may still need a fighter, and whether it is ticked by default. */
export interface Outcome { key: string; change: Change; needsFighter: boolean; checked: boolean; label: string }

const COST = /\b(lose|loses|pay|pays back|pay back|hand over|costs?|charges?|wants|fee|fees|docks?)\b[^.;]*?$/i;

/** Read a result text. fid: the fighter it is about, if the context says (a task, an injury). cost: a "Pay" column. */
export function readOutcomes(rules: Rules, text: string, opts: { fid?: string; cost?: boolean; note: string } = { note: '' }): Outcome[] {
  const t = plain(text).replace(/\s+/g, ' ');
  const out: Outcome[] = [];
  const choice = /\bor\b|\brefuse\b|\binstead\b|\bif\b/i.test(t);
  const add = (key: string, change: Change, label: string, fighterLevel = false) =>
    out.push({ key, change, label, needsFighter: fighterLevel && !opts.fid, checked: !choice });
  const fid = opts.fid ?? '';

  // Parts: "+3 parts", "lose 2 parts", "Pay 3 parts", "pay 8" (a cost verb before the number makes it negative).
  const partsRe = /(\+)?(\d+)\s+parts?\b(?!\s+(?:less|off|more))/gi;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = partsRe.exec(t))) {
    const before = t.slice(Math.max(0, m.index - 40), m.index);
    if (/worth up to\s*$|up to\s*$|for\s*$|buy back|a price/i.test(before)) continue;
    const negative = opts.cost || (!m[1] && COST.test(before.split(/[.;:,]/).pop() ?? ''));
    const n = +m[2];
    if (!n) continue;
    add(`p${i++}`, { kind: 'parts', amount: negative ? -n : n, note: opts.note }, `${negative ? '−' : '+'}${n} parts`);
  }
  const bare = /\b(pay|lose)\s+(\d+)\b(?!\s*(?:parts?|XP|inch|die))/gi;
  while ((m = bare.exec(t))) add(`p${i++}`, { kind: 'parts', amount: -+m[2], note: opts.note }, `−${m[2]} parts`);

  // XP: "+1 XP"
  const xpRe = /\+(\d+) XP/g;
  let j = 0;
  while ((m = xpRe.exec(t))) add(`x${j++}`, { kind: 'xp', fid, amount: +m[1], note: opts.note }, `+${m[1]} XP`, true);

  // Statuses (Sore, Laid up) named as recovery words.
  const statuses = rules.crew.campaign.statuses.value;
  for (const w of rules.data.recovery_words.map((r) => plain(r['Recovery word']))) {
    if (!new RegExp(`\\b${w}\\b`).test(t)) continue;
    const s = statusForWord(rules, w);
    if (s && s !== statuses[0]) { add(`s${w}`, { kind: 'status', fid, value: s }, s, true); break; }
  }

  // "starts the next battle Hyped and Under warranty", "start prone"
  const nb = t.match(/start(?:s)? (?:the next battle|it)\s+([^.;]*)/i);
  if (nb) {
    const names = [...rules.data.states.map((s) => plain(s.State)), ...rules.crew.battle.positions.value.map((p) => p.name)];
    for (const n of names) if (new RegExp(`\\b${n}\\b`, 'i').test(nb[1])) add(`n${n}`, { kind: 'nextBattle', fid, value: n }, `starts the next battle ${n}`, true);
  }

  // Tags, contacts and silly traits named in the text.
  for (const tag of rules.tags.map((x) => x.name)) if (new RegExp(`\\b(gain|gains|gets)\\b[^.;/]*\\b${tag}\\b`).test(t)) add(`t${tag}`, { kind: 'tag', value: tag }, `gain ${tag}`);
  if (/\bcontact\b/i.test(t)) for (const c of rules.contacts.map((x) => x.name)) if (t.includes(c)) add(`c${c}`, { kind: 'contact', value: c }, `contact: ${c}`);
  for (const s of rules.silly) if (t.includes(`"${s.name}"`)) add(`y${s.name}`, { kind: 'silly', fid, value: s.name }, `silly trait ${s.name}`, true);
  return out;
}

/** The two halves of a story event's twist: "Nerve: success / failure". */
export function splitTwist(text: string): { rating: string | null; success: string; failure: string } {
  const t = plain(text);
  const m = t.match(/^(\w+):\s*(.*)$/);
  const body = m ? m[2] : t;
  const [success, failure = ''] = body.split(' / ');
  return { rating: m ? m[1] : null, success: success.trim(), failure: failure.trim() };
}

export function describe(crew: Crew, c: Change): string {
  const who = (fid: string) => crew.fighters.find((f) => f.id === fid)?.name || 'a fighter';
  switch (c.kind) {
    case 'parts': return `${c.amount > 0 ? '+' : '−'}${Math.abs(c.amount)} parts${c.note ? ` (${c.note})` : ''}`;
    case 'xp': return `${who(c.fid)} +${c.amount} XP${c.note ? ` (${c.note})` : ''}`;
    case 'status': return `${who(c.fid)} is ${c.value}`;
    case 'injury': return `${who(c.fid)}: ${c.value}`;
    case 'legend': return `${who(c.fid)} earns the Legend ${c.name}${c.title ? ` ("${c.title}")` : ''}`;
    case 'silly': return c.value ? `${who(c.fid)} gets the silly trait ${c.value}` : `${who(c.fid)}'s silly trait is cleared`;
    case 'tag': return `The crew gains ${c.value}`;
    case 'contact': return `New contact: ${c.value}`;
    case 'rival': return `New rival: ${c.value}`;
    case 'nextBattle': return `${who(c.fid)} starts the next battle ${c.value}`;
    case 'leave': return `${who(c.fid)}: ${c.fate}`;
  }
}

/** Apply changes in order. Returns the crew and a line for each change, for the recap. */
export function applyChanges(rules: Rules, crew: Crew, changes: Change[]): { crew: Crew; lines: string[] } {
  let c = crew;
  const lines: string[] = [];
  const fx = (fid: string, fn: (f: Fighter) => Fighter) => { c = { ...c, fighters: c.fighters.map((f) => (f.id === fid ? fn(f) : f)) }; };
  for (const ch of changes) {
    if ('fid' in ch && ch.fid && !c.fighters.some((f) => f.id === ch.fid)) continue;
    lines.push(describe(c, ch));
    switch (ch.kind) {
      case 'parts': c = addLedger(c, ch.amount, ch.note || (ch.amount > 0 ? 'Parts gained' : 'Parts paid')); break;
      case 'xp': fx(ch.fid, (f) => ({ ...f, xp: f.xp + ch.amount })); break;
      case 'status': fx(ch.fid, (f) => ({ ...f, status: ch.value })); break;
      case 'injury': fx(ch.fid, (f) => (f.injuries.includes(ch.value) ? f : { ...f, injuries: [...f.injuries, ch.value], titles: ch.title ? Array.from(new Set([...f.titles, ch.title])) : f.titles })); break;
      case 'legend': fx(ch.fid, (f) => (f.legends.some((l) => l.name === ch.name) ? f : { ...f, legends: [...f.legends, { id: uid('g'), name: ch.name, title: ch.title }] })); break;
      case 'silly': fx(ch.fid, (f) => ({ ...f, sillyTrait: ch.value })); break;
      case 'tag': {
        const max = rules.crew.limits.maxTags.value;
        let tags = c.notes.tags.filter((x) => x !== ch.value);
        for (const t of rules.tags) { const m = t.text.match(/cannot have both (\w+) and (\w+)/); if (m && (m[1] === ch.value || m[2] === ch.value)) tags = tags.filter((x) => x !== m[1] && x !== m[2]); }
        c = { ...c, notes: { ...c.notes, tags: [...tags, ch.value].slice(-max) } };
        break;
      }
      case 'contact': c = { ...c, notes: { ...c.notes, contacts: [...c.notes.contacts.filter((x) => !x.used), { name: ch.value, used: false }].slice(-rules.crew.limits.maxContacts.value) } }; break;
      case 'rival': c = { ...c, notes: { ...c.notes, rivals: [...c.notes.rivals, ch.value] } }; break;
      case 'nextBattle': fx(ch.fid, (f) => ({ ...f, nextBattle: Array.from(new Set([...(f.nextBattle ?? []), ch.value])) })); break;
      case 'leave': {
        const f = c.fighters.find((x) => x.id === ch.fid)!;
        c = {
          ...c,
          fighters: c.fighters.filter((x) => x.id !== ch.fid),
          captainId: c.captainId === ch.fid ? null : c.captainId,
          items: c.items.filter((o) => !(o.fighterId === ch.fid && o.slot === 'fitted')).map((o) => (o.fighterId === ch.fid ? { ...o, fighterId: null, slot: 'stash' } : o)),
          notes: { ...c.notes, roll: [...c.notes.roll, { id: uid('r'), name: f.name || 'Unnamed fighter', titles: [f.title, ...f.titles].filter(Boolean).join(', '), fate: ch.fate, note: ch.note }] },
        };
        break;
      }
    }
  }
  return { crew: c, lines };
}

/** The fate for a fighter who dies (or a bot destroyed) after a battle (13.2, 13.3). */
export const deathFate = (rules: Rules, f: Fighter) => (isBot(rules, f) ? rules.crew.afterBattle.botDeadFate.value : rules.crew.afterBattle.deadResult.value);
