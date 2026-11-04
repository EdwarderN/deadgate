// Turns a table row's effects (data/manual/outcomes.json) into:
//  - nodes: what to show, including each decision the player must make, and
//  - changes: what to record once those decisions are made.
// The screen draws the nodes; the state holds the player's decisions by path.
import { plain, type Eff, type ItemDef, type Rules } from '../data/rules';
import { captainOf, isBot, itemPrice } from './crew';
import { cellCovers, lookup } from './dice';
import { makesLegend, positionDef } from './battle';
import { deathFate, type Change } from './outcomes';
import type { Battle, Crew, Fighter } from './model';

export interface EffCtx {
  /** the fighter the row is about (the task's fighter, the injured fighter) */
  self?: string | null;
  patient?: string | null;
  teacher?: string | null;
  battle?: Battle | null;
  /** the injury table the row came from, for re-rolls */
  injuryTable?: string;
  /** a bot's core got home (evacuated, captured, held the field, 13.3) */
  coreHome?: boolean;
  note: string;
}
export type EffState = Record<string, unknown>;

export type Node =
  | { kind: 'auto'; path: string; text: string }
  | { kind: 'note'; path: string; text: string }
  | { kind: 'select'; path: string; label: string; options: { value: string; label: string }[]; value: string; multi?: number }
  | { kind: 'text'; path: string; label: string; value: string; placeholder?: string }
  | { kind: 'roll'; path: string; label: string; die: 'd6' | 'd66'; rolls: number[]; times: number; pick?: { path: string; value: number | null; labels: string[] } }
  | { kind: 'test'; path: string; label: string; rating: string; target: number; fid: string | null; value: boolean | null }
  | { kind: 'choice'; path: string; options: string[]; value: number | null }
  | { kind: 'group'; path: string; title: string; children: Node[] };

export interface Resolved {
  nodes: Node[];
  changes: Change[];
  /** decisions still open */
  missing: string[];
  taskPay?: number | 'failure';
  noFinds?: boolean;
  noTasks?: boolean;
  noTask: string[];
}

const name = (f: Fighter | undefined) => f?.name || 'a fighter';

/** Fighters a "who" can mean. auto: decided by the rules; options: the player picks. */
export function whoOptions(rules: Rules, crew: Crew, who: string, ctx: EffCtx): { auto: Fighter[] | null; options: Fighter[]; label: string } {
  const f = (id?: string | null) => crew.fighters.filter((x) => x.id === id);
  const b = ctx.battle;
  switch (who) {
    case 'self': return { auto: f(ctx.self), options: [], label: 'the fighter' };
    case 'patient': return { auto: f(ctx.patient), options: [], label: 'the patient' };
    case 'teacher': return { auto: f(ctx.teacher), options: [], label: 'the teacher' };
    case 'all': return { auto: crew.fighters, options: [], label: 'every fighter' };
    case 'captain': { const c = captainOf(crew); return { auto: c ? [c] : [], options: [], label: 'the captain' }; }
    case 'lowestXp': {
      const min = Math.min(...crew.fighters.map((x) => x.xp));
      const low = crew.fighters.filter((x) => x.xp === min);
      return low.length === 1 ? { auto: low, options: [], label: 'the newest fighter' } : { auto: null, options: low, label: 'the newest fighter (lowest Experience)' };
    }
    case 'evacuated': {
      const ev = b ? crew.fighters.filter((x) => { const p = b.fighters[x.id] && positionDef(rules, b.fighters[x.id].position); return p?.cameHome && !p.onTable; }) : [];
      return { auto: null, options: ev.length ? ev : crew.fighters, label: 'a fighter who was evacuated' };
    }
    case 'legend': {
      const lg = b ? crew.fighters.filter((x) => { const w = b.fighters[x.id]?.word; return w?.result === 'fulfilled' && makesLegend(rules, w.deed); }) : [];
      return lg.length === 1 ? { auto: lg, options: [], label: 'the legend' } : { auto: null, options: lg.length ? lg : crew.fighters, label: 'the legend' };
    }
    case 'bot': return { auto: null, options: crew.fighters.filter((x) => isBot(rules, x)), label: 'a bot' };
    // a second, third or fourth fighter of the player's choice, when a result names several (14.5)
    case 'second': case 'third': case 'fourth': return { auto: null, options: crew.fighters, label: `a ${who} fighter` };
    case 'highestXp': {
      const max = Math.max(...crew.fighters.map((x) => x.xp));
      const top = crew.fighters.filter((x) => x.xp === max);
      return top.length === 1 ? { auto: top, options: [], label: 'the most experienced fighter' } : { auto: null, options: top, label: 'the most experienced fighter' };
    }
    default:
      if (who.startsWith('type:')) return { auto: null, options: crew.fighters.filter((x) => x.type === who.slice(5)), label: `a ${who.slice(5)}` };
      return { auto: null, options: crew.fighters, label: 'a fighter' };
  }
}

/** Shop items an "item" effect may give. */
export function itemOptions(rules: Rules, e: NonNullable<Eff['item']>): ItemDef[] {
  return rules.items.filter((i) => (!e.key || i.key === e.key) && (!e.source || i.source === e.source) && (!e.kinds || e.kinds.includes(i.kind)) && (e.maxPrice === undefined || (i.price ?? 0) <= e.maxPrice) && (e.any || e.key || e.source || e.kinds));
}

export function resolveEffects(rules: Rules, crew: Crew, effs: Eff[], ctx: EffCtx, st: EffState, path: string): Resolved {
  const out: Resolved = { nodes: [], changes: [], missing: [], noTask: [] };
  const merge = (r: Resolved) => {
    out.nodes.push(...r.nodes); out.changes.push(...r.changes); out.missing.push(...r.missing); out.noTask.push(...r.noTask);
    if (r.taskPay !== undefined) out.taskPay = r.taskPay;
    out.noFinds ||= r.noFinds; out.noTasks ||= r.noTasks;
  };
  const sub = (effects: Eff[], p: string) => resolveEffects(rules, crew, effects, ctx, st, p);

  /** Resolve a "who" to fighters, asking once per list for each kind of who. */
  const people = (who: string, p: string): Fighter[] => {
    const w = whoOptions(rules, crew, who, ctx);
    if (w.auto) return w.auto;
    if (w.options.length === 1) return w.options;
    const key = `${path}.who:${who}`;
    const v = String(st[key] ?? '');
    if (!out.nodes.some((n) => n.path === key)) out.nodes.push({ kind: 'select', path: key, label: `Which fighter? (${w.label})`, options: w.options.map((x) => ({ value: x.id, label: x.name || 'Unnamed fighter' })), value: v });
    const f = w.options.find((x) => x.id === v);
    if (!f) { out.missing.push(`choose ${w.label}`); return []; }
    void p;
    return [f];
  };
  const crewItems = (o: { who?: string; kinds?: string[]; source?: string }, p: string) => {
    const owner = o.who ? people(o.who, p).map((f) => f.id) : null;
    return crew.items.filter((i) => { const d = rules.item(i.itemId); return d && (!owner || owner.includes(i.fighterId ?? '')) && (!o.kinds || o.kinds.includes(d.kind)) && (!o.source || d.source === o.source); });
  };

  effs.forEach((e, i) => {
    const p = `${path}.${i}`;
    const auto = (c: Change, text: string) => { out.changes.push(c); out.nodes.push({ kind: 'auto', path: p, text }); };

    if (e.parts !== undefined) {
      const n = e.ifDebt !== undefined && crew.parts < 0 ? e.ifDebt : e.parts;
      if (n) auto({ kind: 'parts', amount: n, note: ctx.note, ...(e.belowZero ? { floor: 'none' as const } : {}) }, `${n > 0 ? '+' : '−'}${Math.abs(n)} parts${e.belowZero && n < 0 ? ', even below 0' : ''}`);
    }
    if (e.xp) for (const f of people(e.who ?? 'self', p)) auto({ kind: 'xp', fid: f.id, amount: e.xp, note: ctx.note }, `${name(f)} +${e.xp} XP`);
    if (e.status) for (const f of people(e.who ?? 'self', p)) auto({ kind: 'status', fid: f.id, value: e.status }, `${name(f)} is ${e.status}`);
    if (e.next) for (const f of people(e.who ?? 'self', p)) auto({ kind: 'nextBattle', fid: f.id, value: e.next }, `${name(f)} starts the next battle ${e.next}`);
    if (e.silly) for (const f of people(e.who ?? 'self', p)) auto({ kind: 'silly', fid: f.id, value: e.silly }, `${name(f)} gets the silly trait ${e.silly}`);
    if (e.title) for (const f of people(e.who ?? 'self', p)) {
      const take = st[p] !== false;
      out.nodes.push({ kind: 'choice', path: p, options: [`Take the title "${e.title}"`, 'No'], value: take ? 0 : 1 });
      if (take) out.changes.push({ kind: 'title', fid: f.id, value: e.title });
    }
    if (e.tag) auto({ kind: 'tag', value: e.tag }, `The crew gains ${e.tag}`);
    if (e.crossContact) {
      // Pay by crossing a contact off the roster (14.5): the crew must have one.
      const names = Array.from(new Set(crew.notes.contacts.map((c) => c.name)));
      if (!names.length) { out.nodes.push({ kind: 'note', path: p, text: 'The crew has no contact to cross off: choose another answer.' }); out.missing.push('a contact to cross off'); }
      else {
        const v = String(st[p] ?? '');
        out.nodes.push({ kind: 'select', path: p, label: 'Which contact is crossed off?', options: names.map((n) => ({ value: n, label: n })), value: v });
        if (v) out.changes.push({ kind: 'removeContact', name: v }); else out.missing.push('choose the contact to cross off');
      }
    }
    if (e.contact) {
      if (e.contact === 'choose') {
        const v = String(st[p] ?? '');
        out.nodes.push({ kind: 'select', path: p, label: 'Which contact?', options: rules.contacts.map((c) => ({ value: c.name, label: c.name })), value: v });
        if (v) out.changes.push({ kind: 'contact', value: v }); else out.missing.push('choose a contact');
      } else auto({ kind: 'contact', value: e.contact }, `New contact: ${e.contact}`);
    }
    if (e.rival) {
      const v = String(st[p] ?? '');
      out.nodes.push({ kind: 'text', path: p, label: 'Name the rival', value: v, placeholder: 'A crew, gang or patron' });
      if (v.trim()) out.changes.push({ kind: 'rival', value: v.trim() }); else out.missing.push('name the rival');
    }
    if (e.lead) {
      // A crew holds at most one lead (14.8): a new one replaces the old. Its wording is the player's, and optional.
      const v = String(st[p] ?? '');
      out.nodes.push({ kind: 'text', path: p, label: `The crew gains a lead${crew.notes.lead ? ' (it replaces the one it has)' : ''}: note it if you like`, value: v, placeholder: 'A tip the crew can act on' });
      out.changes.push({ kind: 'lead', text: v.trim() || 'a lead' });
    }
    if (e.item) {
      const opts = itemOptions(rules, e.item);
      const fit = e.item.fit ? people('self', p)[0] : undefined;
      const replaces = (d: ItemDef) => !!fit && fit.injuries.includes(rules.crew.gear.prosthetics.value[d.key] ?? '\u0000');
      const slot = (d: ItemDef) => (d.slot === 'fitted' || replaces(d) ? 'fitted' : d.slot === 'belt' ? 'belt' : d.slot === 'body' ? 'body' : d.slot === 'frame' ? 'frame' : 'set1');
      if (opts.length === 1) auto({ kind: 'addItem', itemId: opts[0].id, fid: fit?.id ?? null, slot: slot(opts[0]) }, `${fit ? `${name(fit)} gets` : 'Into the stash:'} ${opts[0].name}${e.item.label ? ` (${e.item.label})` : ''}`);
      else {
        const v = String(st[p] ?? '');
        const lab = e.item.label ?? [e.item.source, e.item.kinds?.join(' or ') ?? 'item', e.item.maxPrice !== undefined ? `worth up to ${e.item.maxPrice} parts` : ''].filter(Boolean).join(' ');
        out.nodes.push({ kind: 'select', path: p, label: `Choose ${lab}`, options: opts.map((d) => ({ value: d.id, label: `${d.name} (${d.source}${d.price !== null ? `, ${d.price}` : ''})` })), value: v });
        const d = opts.find((x) => x.id === v);
        if (d) out.changes.push({ kind: 'addItem', itemId: d.id, fid: fit?.id ?? null, slot: slot(d) }); else out.missing.push('choose the item');
      }
    }
    if (e.loseItem || e.sellItem) {
      const o = (e.loseItem ?? e.sellItem)!;
      const items = crewItems(o, p);
      const count = e.loseItem?.count ?? 1;
      const v = (Array.isArray(st[p]) ? st[p] : st[p] ? [st[p]] : []) as string[];
      const label = e.loseItem?.label ?? (e.sellItem ? `an item to sell (${e.sellItem.fraction === 1 ? 'full' : 'half'} price)` : 'an item to lose');
      if (!items.length) out.nodes.push({ kind: 'note', path: p, text: `No item to ${e.sellItem ? 'sell' : 'lose'}.` });
      else {
        out.nodes.push({ kind: 'select', path: p, label: `Choose ${label}`, multi: count, options: items.map((x) => ({ value: x.uid, label: `${rules.item(x.itemId)?.name ?? x.itemId}${x.fighterId ? ` (${name(crew.fighters.find((f) => f.id === x.fighterId))})` : ''}` })), value: v.join(',') });
        const chosen = items.filter((x) => v.includes(x.uid)).slice(0, count);
        if (chosen.length < Math.min(count, items.length)) out.missing.push(`choose ${label}`);
        for (const x of chosen) {
          const d = rules.item(x.itemId);
          out.changes.push({ kind: 'removeItem', uid: x.uid, label: d?.name ?? 'an item' });
          if (e.sellItem && d?.price) out.changes.push({ kind: 'parts', amount: Math.floor(d.price * e.sellItem.fraction), note: `Sold ${d.name}` });
        }
      }
    }
    if (e.buyItem) {
      const opts = rules.shopItems.filter((d) => (!e.buyItem!.source || d.source === e.buyItem!.source) && (!e.buyItem!.kinds || e.buyItem!.kinds.includes(d.kind)));
      const v = String(st[p] ?? '');
      out.nodes.push({ kind: 'select', path: p, label: `Buy one ${e.buyItem.source ?? ''} ${e.buyItem.kinds?.join(' or ') ?? 'item'} at ${e.buyItem.fraction === 0.5 ? 'half ' : ''}price`, options: opts.map((d) => ({ value: d.id, label: `${d.name} (${Math.floor(itemPrice(rules, crew, d) * e.buyItem!.fraction)})` })), value: v });
      const d = opts.find((x) => x.id === v);
      if (d) { out.changes.push({ kind: 'addItem', itemId: d.id, fid: null, slot: 'stash' }, { kind: 'parts', amount: -Math.floor(itemPrice(rules, crew, d) * e.buyItem.fraction), note: `Bought ${d.name}`, floor: 'credit' }); }
    }
    if (e.hire) auto({ kind: 'hireOffer', discount: e.hire.free ? null : e.hire.discount ?? 0, note: e.hire.note ?? '', past: e.hire.past }, `A recruit ${e.hire.free ? 'for free' : `for ${e.hire.discount} parts less`} this break${e.hire.note ? ` (${e.hire.note})` : ''}: use it under Spend`);
    if (e.relicLead) auto({ kind: 'relicLead', noRoll: e.relicLead.noRoll }, `One relic at half price this break${e.relicLead.noRoll ? ', no seller roll' : ''}: under Spend`);
    if (e.sellerFound) {
      const opts = rules.shopItems.filter((d) => d.source === 'old stock');
      const v = String(st[p] ?? '');
      out.nodes.push({ kind: 'select', path: p, label: 'Which old-stock item has a seller this break?', options: opts.map((d) => ({ value: d.id, label: d.name })), value: v });
      if (v) out.changes.push({ kind: 'sellerFound', itemId: v }); else out.missing.push('choose the old-stock item');
    }
    if (e.noTasks) { out.noTasks = true; auto({ kind: 'note', text: 'No downtime tasks this break' }, 'Every fighter takes no task this break'); }
    if (e.noTask) for (const f of people(e.noTask, p)) { out.noTask.push(f.id); out.nodes.push({ kind: 'auto', path: p, text: `${name(f)} takes no task this break` }); }
    if (e.gift) {
      const gifted = crew.fighters.filter((f) => f.gift).length;
      const can = gifted < rules.crew.limits.maxGifted.value ? crew.fighters.filter((f) => !f.gift && rules.crew.limits.giftSpecies.value.includes(f.species)) : [];
      if (!can.length) out.nodes.push({ kind: 'note', path: p, text: 'Nobody can take the gift.' });
      else { const v = String(st[p] ?? ''); out.nodes.push({ kind: 'select', path: p, label: 'Who takes the gift?', options: [{ value: '-', label: 'Nobody' }, ...can.map((f) => ({ value: f.id, label: name(f) }))], value: v }); if (v && v !== '-') out.changes.push({ kind: 'gift', fid: v }); }
    }
    if (e.healInjury) for (const f of people(e.healInjury, p)) {
      if (!f.injuries.length) { out.nodes.push({ kind: 'note', path: p, text: `${name(f)} has no lasting injury.` }); continue; }
      const v = String(st[p] ?? '');
      out.nodes.push({ kind: 'select', path: p, label: `Which of ${name(f)}'s injuries is gone?`, options: f.injuries.map((x) => ({ value: x, label: x })), value: v });
      if (v) out.changes.push({ kind: 'healInjury', fid: f.id, value: v }); else out.missing.push('choose the injury');
    }
    if (e.prosthetic) for (const f of people(e.prosthetic, p)) {
      const opts = rules.items.filter((d) => d.source === 'copy' && f.injuries.includes(rules.crew.gear.prosthetics.value[d.key] ?? '\u0000'));
      if (!opts.length) { out.nodes.push({ kind: 'note', path: p, text: `${name(f)} needs no prosthetic.` }); continue; }
      const d = opts[0];
      auto({ kind: 'addItem', itemId: d.id, fid: f.id, slot: 'fitted' }, `${name(f)} wakes up with a ${d.name}`);
    }
    if (e.recharge !== undefined) {
      const amount = e.recharge === 'full' ? null : e.recharge;
      if ((e.who ?? 'all') === 'all') auto({ kind: 'recharge', fid: null, amount, note: ctx.note }, `Every battery ${amount === null ? 'refills' : `gains ${amount} Energy`}, free`);
      else for (const f of people(e.who!, p)) auto({ kind: 'recharge', fid: f.id, amount, note: ctx.note }, `${name(f)}'s battery ${amount === null ? 'refills' : `gains ${amount} Energy`}, free`);
    }
    if (e.debt) {
      const yes = crew.parts < 0;
      out.nodes.push({ kind: 'note', path: p, text: yes ? "The crew's parts are below 0." : "The crew's parts are not below 0." });
      merge(sub(yes ? e.debt.yes : e.debt.no, `${p}.${yes ? 'y' : 'n'}`));
    }
    if (e.allLaidUpToSore) auto({ kind: 'laidUpToSore' }, 'Every Laid up fighter is only Sore');
    if (e.injury) for (const f of people(e.who ?? 'self', p)) auto({ kind: 'injury', fid: f.id, value: e.injury, title: rules.injuries.find((x) => x.name === e.injury)?.title ?? null }, `${name(f)}: ${e.injury}`);
    if (e.injuryRoll) for (const f of people('self', p)) merge(injuryRoll(rules, f, e.injuryRoll, e.times ?? 1, st, p, ctx));
    if (e.reroll && ctx.injuryTable) {
      const rows = rules.data.injury_tables[ctx.injuryTable] ?? [];
      const rolls = ((st[p] as number[]) ?? []);
      const pick = st[`${p}.c`] as number | undefined;
      out.nodes.push({ kind: 'roll', path: p, label: `Roll twice more (${ctx.injuryTable.replace(/^The /, '')})`, die: 'd66', rolls, times: e.reroll, pick: rolls.length >= e.reroll ? { path: `${p}.c`, value: pick ?? null, labels: rolls.map((r) => `${r}: ${plain(lookup(rows, r)?.Result ?? '')}`) } : undefined });
      const chosen = pick !== undefined ? rolls[pick] : undefined;
      if (chosen === undefined) out.missing.push('roll and choose');
      else {
        const row = lookup(rows, chosen);
        const effects = row ? rules.outcomes.injuryTables[ctx.injuryTable]?.[row.d66] ?? [] : [];
        const r = sub(effects.filter((x) => !x.reroll), `${p}.r`);
        out.nodes.push({ kind: 'group', path: `${p}.r`, title: plain(row?.Result ?? ''), children: r.nodes });
        r.nodes = []; merge(r);
      }
    }
    if (e.dead) for (const f of people('self', p)) {
      // A destroyed bot whose core got home is rebuilt with half its Experience (13.3).
      if (isBot(rules, f) && ctx.coreHome) auto({ kind: 'botReplace', fid: f.id, fraction: rules.crew.afterBattle.botCore.value }, `${name(f)}: ${deathFate(rules, f)}, but the core came home: a new chassis, half the Experience`);
      else auto({ kind: 'leave', fid: f.id, fate: deathFate(rules, f), note: ctx.note }, `${name(f)}: ${deathFate(rules, f)}. Their gear returns to the crew`);
    }
    if (e.leave) for (const f of people(e.leave, p)) auto({ kind: 'leave', fid: f.id, fate: 'Left the crew', note: ctx.note }, `${name(f)} leaves the crew (their gear stays)`);
    if (e.finds) {
      const rolls = ((st[p] as number[]) ?? []);
      const keep = e.keep ?? e.finds;
      const pick = st[`${p}.c`] as number | undefined;
      out.nodes.push({ kind: 'roll', path: p, label: `The finds table${e.finds > 1 ? `, ${e.finds} times${keep < e.finds ? ', keep one' : ''}` : ''}`, die: 'd6', rolls, times: e.finds,
        pick: keep < e.finds && rolls.length >= e.finds ? { path: `${p}.c`, value: pick ?? null, labels: rolls.map((r) => `${r}: ${plain(lookup(rules.data.finds, r)?.Find ?? '')}`) } : undefined });
      const kept = rolls.length < e.finds ? [] : keep < e.finds ? (pick !== undefined ? [rolls[pick]] : []) : rolls;
      if (!kept.length) out.missing.push('roll on the finds table');
      kept.forEach((r, k) => {
        const row = lookup(rules.data.finds, r);
        const res = sub(row ? rules.outcomes.finds[row.d6] ?? [] : [], `${p}.f${k}`);
        out.nodes.push({ kind: 'group', path: `${p}.f${k}`, title: `Find ${r}: ${plain(row?.Find ?? '')}`, children: res.nodes });
        res.nodes = []; merge(res);
      });
    }
    if (e.drop) {
      const rolls = ((st[p] as number[]) ?? []);
      out.nodes.push({ kind: 'roll', path: p, label: 'The drop table', die: 'd66', rolls, times: 1 });
      if (!rolls.length) out.missing.push('roll on the drop table');
      else {
        const row = lookup(rules.data.drop_table, rolls[0]);
        const res = sub(row ? rules.outcomes.dropTable[row.d66] ?? [] : [], `${p}.d`);
        out.nodes.push({ kind: 'group', path: `${p}.d`, title: `${rolls[0]}: ${plain(row?.['What came out'] ?? '')}`, children: res.nodes });
        res.nodes = []; merge(res);
      }
    }
    if (e.d6) {
      const rolls = ((st[p] as number[]) ?? []);
      out.nodes.push({ kind: 'roll', path: p, label: 'Roll a d6', die: 'd6', rolls, times: 1 });
      const hit = rolls.length ? e.d6.find((d) => cellCovers(d.range.replace(' to ', '-'), rolls[0])) : undefined;
      if (!hit) out.missing.push('roll a d6');
      else { const res = sub(hit.effects, `${p}.x`); out.nodes.push({ kind: 'group', path: `${p}.x`, title: `${rolls[0]}`, children: res.nodes }); res.nodes = []; merge(res); }
    }
    if (e.test) {
      const v = st[p] as boolean | undefined;
      out.nodes.push({ kind: 'test', path: p, label: `${e.test.rating} test, ${e.test.target}+`, rating: e.test.rating, target: e.test.target, fid: ctx.self ?? null, value: v ?? null });
      if (v === undefined) out.missing.push('make the test');
      else { const res = sub(v ? e.success ?? [] : e.failure ?? [], `${p}.t`); merge(res); }
    }
    if (e.choice) {
      const v = st[p] as number | undefined;
      out.nodes.push({ kind: 'choice', path: p, options: e.choice.map((c) => c.label), value: v ?? null });
      if (v === undefined) out.missing.push('make the choice');
      else { const res = sub(e.choice[v]?.effects ?? [], `${p}.o${v}`); merge(res); }
    }
    if (e.taskPay !== undefined) { out.taskPay = e.taskPay; out.nodes.push({ kind: 'auto', path: p, text: e.taskPay === 0 ? 'The task pays nothing' : e.taskPay === 'failure' ? 'The task pays only its failure pay' : e.taskPay === 2 ? 'The task pays double' : 'The task pays half (rounded down)' }); }
    if (e.noFinds) { out.noFinds = true; out.nodes.push({ kind: 'auto', path: p, text: 'No finds roll' }); }
    if (e.retest) out.nodes.push({ kind: 'note', path: p, text: "Make the task's test once more (no second table roll)." });
    if (e.swapAdvance) out.nodes.push({ kind: 'note', path: p, text: `The trainee may swap one advance${e.swapAdvance === 'any' ? ' for one from any list' : e.swapAdvance === 'teacher' ? " for a trait the teacher has (not a Legend or captain trait)" : ' for another they qualify for'}: do it on their card.` });
    if (e.note) { out.changes.push({ kind: 'note', text: e.note }); out.nodes.push({ kind: 'note', path: p, text: e.note }); }
  });
  return out;
}

/** A lasting injury from a list (or a glitch for a bot), rolled `times` and one chosen (13.2, 13.3). */
function injuryRoll(rules: Rules, f: Fighter, list: string, times: number, st: EffState, p: string, ctx: EffCtx): Resolved {
  const out: Resolved = { nodes: [], changes: [], missing: [], noTask: [] };
  const bot = isBot(rules, f);
  const rows = bot ? rules.glitches : rules.injuries.filter((i) => i.table === list);
  const max = rules.crew.limits.maxLastingInjuries.value;
  const laid = rules.crew.campaign.statuses.value.find((s) => /laid/i.test(s)) ?? '';
  if (f.injuries.length >= max) {
    out.nodes.push({ kind: 'auto', path: p, text: `${name(f)} already has ${max} lasting injuries: ${laid} instead (13.2)` });
    out.changes.push({ kind: 'status', fid: f.id, value: laid });
    return out;
  }
  const rolls = ((st[p] as number[]) ?? []);
  const pick = st[`${p}.c`] as number | undefined;
  const label = bot ? 'A glitch (d6, 13.3)' : `${list} lasting injury (d6)`;
  const fresh = rolls.map((r) => rows[r - 1]).filter((x) => x && !f.injuries.includes(x.name));
  out.nodes.push({ kind: 'roll', path: p, label: times > 1 ? `${label}, twice: choose one` : label, die: 'd6', rolls, times: times + (rolls.length - fresh.length),
    pick: times > 1 && fresh.length >= times ? { path: `${p}.c`, value: pick ?? null, labels: rolls.map((r) => `${r}: ${rows[r - 1]?.name ?? ''}`) } : undefined });
  const dupes = rolls.filter((r) => rows[r - 1] && f.injuries.includes(rows[r - 1].name));
  if (dupes.length) out.nodes.push({ kind: 'note', path: `${p}.dup`, text: `${dupes.map((r) => rows[r - 1].name).join(', ')}: they have it already, so roll again (13.2).` });
  const chosen = times > 1 ? (pick !== undefined ? rows[rolls[pick] - 1] : undefined) : fresh[0];
  if (!chosen || f.injuries.includes(chosen.name)) { out.missing.push('roll the lasting injury'); return out; }
  out.changes.push({ kind: 'injury', fid: f.id, value: chosen.name, title: chosen.title });
  out.nodes.push({ kind: 'auto', path: `${p}.r`, text: `${name(f)}: ${chosen.name} ("${chosen.title}")` });
  void ctx;
  return out;
}
