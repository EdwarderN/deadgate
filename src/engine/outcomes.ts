// Changes to a crew from the after-battle steps, and applying them.
// What a table row does is data (data/manual/outcomes.json), resolved in effects.ts.
import { plain, type Rules } from '../data/rules';
import { addLedger, isBot } from './crew';
import { uid, type Crew, type Fighter, type ItemSlot } from './model';

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
  | { kind: 'leave'; fid: string; fate: string; note: string }
  | { kind: 'addItem'; itemId: string; fid: string | null; slot: ItemSlot }
  | { kind: 'removeItem'; uid: string; label: string }
  | { kind: 'hireOffer'; discount: number | null; note: string; past?: string }
  | { kind: 'relicLead'; noRoll: boolean }
  | { kind: 'sellerFound'; itemId: string }
  | { kind: 'rumour'; text: string }
  | { kind: 'gift'; fid: string }
  | { kind: 'healInjury'; fid: string; value: string }
  | { kind: 'laidUpToSore' }
  | { kind: 'title'; fid: string; value: string }
  | { kind: 'note'; text: string };

/** The two halves of a story event's twist: "Nerve: success / failure". */
export function splitTwist(text: string): { rating: string | null; success: string; failure: string } {
  const t = plain(text);
  const m = t.match(/^(\w+):\s*(.*)$/);
  const body = m ? m[2] : t;
  const [success, failure = ''] = body.split(' / ');
  return { rating: m ? m[1] : null, success: success.trim(), failure: failure.trim() };
}

let itemName = (id: string) => id.split('|')[0];
export const setItemNamer = (fn: (id: string) => string) => { itemName = fn; };

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
    case 'addItem': return `${c.fid ? `${who(c.fid)} gets` : 'Into the stash:'} ${itemName(c.itemId)}`;
    case 'removeItem': return `Lose ${c.label}`;
    case 'hireOffer': return `A recruit ${c.discount === null ? 'for free' : `for ${c.discount} parts less`}${c.note ? ` (${c.note})` : ''}, this break`;
    case 'relicLead': return `A relic lead: one relic at half price${c.noRoll ? ', no seller roll' : ''}, this break`;
    case 'sellerFound': return `A seller for the ${itemName(c.itemId)} this break`;
    case 'rumour': return `Crew rumour: ${c.text}`;
    case 'gift': return `${who(c.fid)} gains the gift`;
    case 'healInjury': return `${who(c.fid)}: ${c.value} healed`;
    case 'laidUpToSore': return 'Every Laid up fighter is only Sore';
    case 'title': return `${who(c.fid)} takes the title "${c.value}"`;
    case 'note': return `Remember: ${c.text}`;
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
      case 'addItem': c = { ...c, items: [...c.items, { uid: uid('i'), itemId: ch.itemId, fighterId: ch.fid, slot: ch.fid ? ch.slot : 'stash', paid: 0, note: 'found' }] }; break;
      case 'removeItem': c = { ...c, items: c.items.filter((o) => o.uid !== ch.uid) }; break;
      case 'hireOffer': c = { ...c, hireOffers: [...(c.hireOffers ?? []), { id: uid('h'), discount: ch.discount, note: ch.note, past: ch.past }] }; break;
      case 'relicLead': c = { ...c, relicLead: { noRoll: ch.noRoll || !!c.relicLead?.noRoll } }; break;
      case 'sellerFound': c = { ...c, sellers: { ...(c.sellers ?? {}), [ch.itemId]: { found: true } } }; break;
      case 'rumour': c = { ...c, notes: { ...c.notes, rumour: ch.text } }; break;
      case 'gift': fx(ch.fid, (f) => ({ ...f, gift: true })); break;
      case 'healInjury': fx(ch.fid, (f) => ({ ...f, injuries: f.injuries.filter((i) => i !== ch.value) })); break;
      case 'laidUpToSore': {
        const [, sore, laid] = rules.crew.campaign.statuses.value;
        c = { ...c, fighters: c.fighters.map((f) => (f.status === laid ? { ...f, status: sore } : f)) };
        break;
      }
      case 'title': fx(ch.fid, (f) => ({ ...f, titles: Array.from(new Set([...f.titles, ch.value])), title: f.title || ch.value })); break;
      case 'note': break;
    }
  }
  return { crew: c, lines };
}

/** The fate for a fighter who dies (or a bot destroyed) after a battle (13.2, 13.3). */
export const deathFate = (rules: Rules, f: Fighter) => (isBot(rules, f) ? rules.crew.afterBattle.botDeadFate.value : rules.crew.afterBattle.deadResult.value);
