// Crew logic: prices, fighter stats, starting kit, slots and campaign actions.
// Everything is a function of the rules data; no game names live here.
import type { Rules, ItemDef } from '../data/rules';
import { keyOf } from '../data/rules';
import type { PriceRule } from '../data/schema';
import { uid, type Crew, type Fighter, type ItemSlot, type OwnedItem } from './model';

// ---------- faction rules ----------
export function subfactionOf(rules: Rules, crew: Crew) {
  return rules.faction(crew.faction ?? '')?.subfactions.find((s) => s.name === crew.subfaction);
}

/** A numbered faction rule is in force unless the crew's subfaction replaces it (12.1). */
export function ruleActive(rules: Rules, crew: Crew, n: number | undefined): boolean {
  if (n === undefined) return true;
  return subfactionOf(rules, crew)?.replaces !== n;
}

export function activePriceRules(rules: Rules, crew: Crew): PriceRule[] {
  const fr = rules.factionRules(crew.faction ?? '');
  return (fr?.priceRules ?? []).filter((pr) => (pr.subfaction ? crew.subfaction === pr.subfaction : ruleActive(rules, crew, pr.rule)));
}

export function captainOf(crew: Crew): Fighter | undefined {
  return crew.fighters.find((f) => f.id === crew.captainId);
}

export function captainTraitNames(f: Fighter): string[] {
  return [
    ...f.captainTraits.filter((t) => !t.retired).map((t) => t.name),
    ...f.advances.filter((a) => a.kind === 'captain' && !a.retired).map((a) => (a as { name: string }).name),
  ];
}

// ---------- prices ----------
export function itemPrice(rules: Rules, crew: Crew, item: ItemDef): number {
  let p = item.price ?? 0;
  for (const pr of activePriceRules(rules, crew)) {
    if (pr.kind === 'copyDiscount' && item.source === 'copy') p = Math.max(pr.min ?? 0, p - (pr.amount ?? 0));
  }
  return p;
}

export function needsSeller(rules: Rules, crew: Crew, item: ItemDef): boolean {
  if (item.source !== 'old stock') return false;
  return !activePriceRules(rules, crew).some((pr) => pr.kind === 'noSellerRoll' && (!pr.itemKind || pr.itemKind === item.kind) && (!pr.source || pr.source === item.source));
}

export function sellerTarget(rules: Rules, crew: Crew): { value: number; source: string; why?: string } {
  const s = rules.crew.creation.oldStockSeller;
  const cap = captainOf(crew);
  const names = cap ? captainTraitNames(cap) : [];
  for (const m of s.modifiers) if (names.includes(m.captainTrait)) return { value: m.value, source: m.source, why: m.captainTrait };
  return { value: s.value, source: s.source };
}

/** The recruit key for a fighter: its type if the recruit table prices that type (bot chassis, volunteers), else its species. */
export function recruitKey(rules: Rules, f: Pick<Fighter, 'species' | 'type'>): string {
  return f.type && rules.recruitPrices[f.type] !== undefined ? f.type : f.species;
}

export function hirePrice(rules: Rules, crew: Crew, f: Pick<Fighter, 'species' | 'type'>): number {
  const key = recruitKey(rules, f);
  let p = rules.recruitPrices[key] ?? rules.crew.creation.rookieBasePrice.value;
  for (const pr of activePriceRules(rules, crew)) {
    if (pr.kind === 'recruitPrice' && pr.recruit === key && pr.price !== undefined) p = pr.price;
    if (pr.kind === 'chassisDiscount' && f.type && rules.chassis[f.type]) p -= pr.amount ?? 0;
  }
  return Math.max(0, p);
}

export function rookieSurcharge(rules: Rules, crew: Crew, f: Pick<Fighter, 'species' | 'type'>): number {
  return Math.max(0, hirePrice(rules, crew, f) - rules.crew.creation.rookieBasePrice.value);
}

function typeGrant(rules: Rules, crew: Crew, f: Pick<Fighter, 'type'>) {
  return f.type ? rules.factionRules(crew.faction ?? '')?.typeGrants?.[f.type] : undefined;
}

/** null: not allowed for this faction. 0: free (a type grants it). */
export function giftPrice(rules: Rules, crew: Crew, f: Pick<Fighter, 'type'>): number | null {
  if (typeGrant(rules, crew, f)?.gift) return 0;
  return rules.factionRules(crew.faction ?? '')?.specials.gift ?? null;
}
export function ritesPrice(rules: Rules, crew: Crew, f: Pick<Fighter, 'type'>): number | null {
  if (typeGrant(rules, crew, f)?.rites) return 0;
  return rules.factionRules(crew.faction ?? '')?.specials.rites ?? null;
}
export function hasGift(rules: Rules, crew: Crew, f: Fighter) { return f.gift || !!typeGrant(rules, crew, f)?.gift; }
export function hasRites(rules: Rules, crew: Crew, f: Fighter) {
  return f.rites || !!typeGrant(rules, crew, f)?.rites || f.advances.some((a) => a.kind === 'trait' && a.name === rules.crew.experience.ritesAdvance.value && !a.retired);
}
/** How many rites the fighter may know: the base from Rites (8.3, faction rules) plus one per rite advance. */
export function ritesAllowed(rules: Rules, crew: Crew, f: Fighter): number {
  if (!hasRites(rules, crew, f)) return 0;
  const fr = rules.factionRules(crew.faction ?? '');
  let base = 1;
  const g = typeGrant(rules, crew, f);
  if (g?.ritesKnown) base = g.ritesKnown;
  if (fr?.ritesKnownByAnyPriest && ruleActive(rules, crew, fr.ritesKnownByAnyPriest.rule)) base = Math.max(base, fr.ritesKnownByAnyPriest.value);
  return base;
}
/** Rites from advances ("Rite of X") are known by the advance itself. */
export function riteFromAdvance(rules: Rules, name: string): string | null {
  const def = rules.advanceDefs.find((d) => d.name === name);
  if (!def || def.needs !== rules.crew.experience.ritesAdvance.value) return null;
  return rules.rites.find((r) => name.endsWith(r)) ?? null;
}
export function ritesKnown(rules: Rules, f: Fighter): string[] {
  const fromAdv = f.advances.flatMap((a) => (a.kind === 'trait' && !a.retired ? [riteFromAdvance(rules, a.name)] : [])).filter(Boolean) as string[];
  return Array.from(new Set([...f.ritesKnown, ...fromAdv]));
}

export interface SpendLine { label: string; amount: number; fighterId?: string; uid?: string }

/** What crew creation costs, line by line (11.1, 11.3). */
export function creationSpend(rules: Rules, crew: Crew): SpendLine[] {
  const lines: SpendLine[] = [];
  for (const f of crew.fighters) {
    const who = f.name || 'Unnamed fighter';
    if (f.rookie) {
      const s = rookieSurcharge(rules, crew, f);
      if (s) lines.push({ label: `${who}: ${recruitKey(rules, f)} costs more than a rookie`, amount: s, fighterId: f.id });
    } else lines.push({ label: `${who}: hired (${recruitKey(rules, f)})`, amount: hirePrice(rules, crew, f), fighterId: f.id });
    if (f.gift) { const p = giftPrice(rules, crew, f); if (p) lines.push({ label: `${who}: the gift`, amount: p, fighterId: f.id }); }
    if (f.rites) { const p = ritesPrice(rules, crew, f); if (p) lines.push({ label: `${who}: Rites`, amount: p, fighterId: f.id }); }
  }
  for (const o of crew.items) {
    if (o.kitRef) continue;
    const it = rules.item(o.itemId);
    if (it) lines.push({ label: `${it.name} (${it.source})`, amount: itemPrice(rules, crew, it), uid: o.uid });
  }
  return lines;
}

export function partsLeft(rules: Rules, crew: Crew): number {
  if (crew.phase === 'campaign') return crew.parts;
  return rules.crew.creation.startingParts.value - creationSpend(rules, crew).reduce((a, l) => a + l.amount, 0);
}

/** The lowest the crew's parts may go: 0, or a faction's credit (Ledgerhands, 12.5). */
export function creditFloor(rules: Rules, crew: Crew): { value: number; rule?: number } {
  const c = rules.factionRules(crew.faction ?? '')?.credit;
  if (c && ruleActive(rules, crew, c.rule)) return { value: c.value, rule: c.rule };
  return { value: 0 };
}

/** May the crew spend this much now? (14.2, 12.5: below 0 a crew buys and hires nothing more.) */
export function canSpend(rules: Rules, crew: Crew, amount: number): boolean {
  if (amount <= 0) return true;
  const left = partsLeft(rules, crew);
  if (crew.phase === 'campaign' && left < 0) return false;
  return left - amount >= creditFloor(rules, crew).value;
}

// ---------- fighter stats ----------
export function ratingNames(rules: Rules) { return rules.crew.limits.ratingNames.value; }

export function currentRatings(rules: Rules, f: Fighter): Record<string, number> {
  const r: Record<string, number> = {};
  for (const n of ratingNames(rules)) r[n] = f.baseRatings[n] ?? 0;
  for (const a of f.advances) if (a.kind === 'rating' || a.kind === 'ace') r[a.rating] = (r[a.rating] ?? 0) + 1;
  return r;
}

export const isBot = (rules: Rules, f: Pick<Fighter, 'species'>) => f.species === rules.crew.limits.botSpecies.value;

export function equipped(crew: Crew, f: Fighter, rules?: Rules): (OwnedItem & { def?: ItemDef })[] {
  return crew.items.filter((o) => o.fighterId === f.id && o.slot !== 'stash').map((o) => ({ ...o, def: rules?.item(o.itemId) }));
}

function equippedKeys(rules: Rules, crew: Crew, f: Fighter): string[] {
  return equipped(crew, f, rules).map((o) => o.def?.key ?? '');
}

export function hasMilitaryFrame(rules: Rules, crew: Crew, f: Fighter) {
  return equipped(crew, f, rules).some((o) => o.slot === 'frame' && o.def?.key === rules.crew.gear.frameKeys.value.military);
}

export interface FighterStats { move: number | null; moveText: string; hands: number; save: number | null; energy: number; beltUsed: number; notes: string[] }

export function fighterStats(rules: Rules, crew: Crew, f: Fighter): FighterStats {
  const g = rules.crew.gear;
  const notes: string[] = [];
  const ch = f.type ? rules.chassis[f.type] : undefined;
  const sp = rules.species.find((s) => s.name === f.species);
  let move: number | null = ch ? ch.move : sp?.move ?? null;
  let hands = ch ? ch.hands : g.handsInUse.value[f.species] ?? g.handsInUse.value.default;
  const keys = equippedKeys(rules, crew, f);
  const fitted = equipped(crew, f, rules).filter((o) => o.slot === 'fitted').map((o) => o.def?.key ?? '');
  for (const inj of f.injuries) {
    const eff = g.injuryEffects.value[inj];
    if (!eff) continue;
    if (eff.hands) hands += eff.hands;
    if (eff.moveHalved && move !== null) {
      const fix = Object.entries(eff.fixedBy ?? {}).find(([k]) => fitted.includes(k));
      if (fix) move += fix[1].move;
      else move = Math.ceil(move / 2);
    }
  }
  for (const o of equipped(crew, f, rules)) if (o.def && o.slot !== 'stash') hands += o.def.handsBonus;
  hands = Math.max(g.minHands.value, hands);
  for (const k of keys) if (g.moveModifiers.value[k] !== undefined && move !== null) move += g.moveModifiers.value[k];
  let save: number | null = null;
  for (const o of equipped(crew, f, rules)) {
    if ((o.slot === 'body' || o.slot === 'frame') && o.def && g.saveDice.value[o.def.key] !== undefined) save = Math.max(save ?? -1, g.saveDice.value[o.def.key]);
  }
  const energy = hasMilitaryFrame(rules, crew, f) ? g.battery.value.militaryFrame : g.battery.value.default;
  const beltUsed = equipped(crew, f, rules).filter((o) => o.slot === 'belt').reduce((a, o) => a + (o.def?.belt || 1), 0);
  let moveText = move === null ? (sp?.moveText ?? '') : String(move);
  if (sp && move !== null && !/^\d+$/.test(sp.moveText) && !ch) { moveText = `${move}`; notes.push(`Move: ${sp.moveText}`); }
  return { move, moveText, hands, save, energy, beltUsed, notes };
}

// ---------- slots ----------
/** The slots an item may go in, by its kind (7.1). */
export function slotOptions(rules: Rules, item: ItemDef): ItemSlot[] {
  const mw = rules.crew.gear.mountWeapons.value;
  if (item.mount) return ['mount'];
  switch (item.slot) {
    case 'hands': return item.kind === 'weapon' && mw.alsoTwoHanded && item.hands >= rules.crew.gear.handsPerSet.value ? ['set1', 'set2', 'mount'] : ['set1', 'set2'];
    case 'body': return ['body'];
    case 'frame': return ['frame'];
    case 'belt': return ['belt'];
    case 'fitted': return ['fitted'];
  }
}

export function slotLoad(rules: Rules, crew: Crew, f: Fighter, slot: ItemSlot, exceptUid?: string): number {
  return equipped(crew, f, rules).filter((o) => o.slot === slot && o.uid !== exceptUid).reduce((a, o) => {
    const d = o.def;
    if (!d) return a;
    if (slot === 'set1' || slot === 'set2') return a + d.hands;
    if (slot === 'belt') return a + (d.belt || 1);
    return a + 1;
  }, 0);
}

export function slotCapacity(rules: Rules, crew: Crew, f: Fighter, slot: ItemSlot): number {
  const g = rules.crew.gear;
  switch (slot) {
    case 'set1': case 'set2': return g.handsPerSet.value;
    case 'belt': return g.beltSlots.value;
    case 'body': return hasMilitaryFrame(rules, crew, f) ? 0 : g.bodySlots.value;
    case 'frame': return g.frameSlots.value;
    case 'mount': return hasMilitaryFrame(rules, crew, f) ? 1 : 0;
    case 'fitted': return 99;
    default: return 99;
  }
}

/** The first slot where the item fits without breaking a slot rule, or 'stash'. */
export function autoSlot(rules: Rules, crew: Crew, f: Fighter, item: ItemDef): ItemSlot {
  for (const s of slotOptions(rules, item)) {
    const size = s === 'set1' || s === 'set2' ? item.hands : s === 'belt' ? item.belt || 1 : 1;
    if (s === 'fitted') {
      const inj = rules.crew.gear.prosthetics.value[item.key];
      if (inj && f.injuries.includes(inj)) return s;
      continue;
    }
    if (slotLoad(rules, crew, f, s) + size <= slotCapacity(rules, crew, f, s)) return s;
  }
  return 'stash';
}

// ---------- starting kit ----------
export interface KitLine { ref: string; itemId: string | null; label: string; pick?: { kind: string; source: string; maxPrice: number }; assign?: string; index: number }

export function kitLines(rules: Rules, crew: Crew): KitLine[] {
  const fr = rules.factionRules(crew.faction ?? '');
  if (!fr) return [];
  const out: KitLine[] = [];
  fr.startingKit.forEach((e, i) => {
    if (e.item) {
      const id = `${keyOf(e.item)}|${e.source ?? 'copy'}`;
      for (let c = 0; c < (e.count ?? 1); c++) out.push({ ref: `${crew.faction}#${i}#${c}`, itemId: id, label: e.who ? `${e.item} (${e.who})` : e.item, assign: e.assign, index: c });
    } else if (e.pick) {
      const ref = `${crew.faction}#${i}#0`;
      out.push({ ref, itemId: crew.kitPicks[ref] ?? null, label: e.choice ?? 'A choice', pick: e.pick, index: 0 });
    }
  });
  return out;
}

export function kitPickOptions(rules: Rules, _crew: Crew, pick: NonNullable<KitLine['pick']>): ItemDef[] {
  return rules.shopItems.filter((i) => i.kind === pick.kind && i.source === pick.source && (i.price ?? 0) <= pick.maxPrice);
}

/** Take the kit back and hand it out again from scratch. */
export function resetKit(rules: Rules, crew: Crew): Crew {
  return syncKit(rules, { ...crew, items: crew.items.filter((o) => !o.kitRef) });
}

/** Make the crew's kit items match its faction's starting kit (chapter 12). */
export function syncKit(rules: Rules, crew: Crew): Crew {
  const lines = kitLines(rules, crew);
  const refs = new Set(lines.map((l) => l.ref));
  let items = crew.items.filter((o) => !o.kitRef || (refs.has(o.kitRef) && lines.find((l) => l.ref === o.kitRef)?.itemId === o.itemId));
  const next: Crew = { ...crew, items };
  const rookies = crew.fighters.filter((f) => f.rookie);
  for (const l of lines) {
    if (!l.itemId || items.some((o) => o.kitRef === l.ref)) continue;
    const def = rules.item(l.itemId);
    if (!def) continue;
    let who: Fighter | undefined;
    if (l.assign === 'captain') who = captainOf(crew);
    else if (l.assign === 'eachRookie') who = rookies[l.index];
    else if (l.assign === 'otherRookie') who = rookies.find((f) => f.id !== crew.captainId && !items.some((o) => o.fighterId === f.id && o.itemId === l.itemId));
    const slot = who ? autoSlot(rules, next, who, def) : 'stash';
    items = [...items, { uid: uid('i'), itemId: l.itemId, fighterId: slot === 'stash' ? null : who!.id, slot, kitRef: l.ref, seller: 'found' }];
    next.items = items;
  }
  return next;
}

// ---------- factories ----------
export function newFighter(rules: Rules, over: Partial<Fighter> = {}): Fighter {
  return {
    id: uid('f'), name: '', title: '', species: rules.crew.limits.playableSpecies.value[0], type: null,
    baseRatings: Object.fromEntries(ratingNames(rules).map((n) => [n, 0])),
    gift: false, rites: false, ritesKnown: [], captainTraits: [], advances: [], legends: [], injuries: [],
    sillyTrait: null, xp: 0, status: rules.crew.campaign.statuses.value[0], word: '', past: '', history: [], titles: [],
    rookie: false, notes: '', ...over,
  };
}

export function newCrew(rules: Rules): Crew {
  const now = new Date().toISOString();
  const n = rules.crew.creation.startingRookies.value;
  return {
    schema: 1, id: uid('c'), rulesVersion: rules.version, name: '', tape: '', faction: null, subfaction: null, captainId: null,
    fighters: Array.from({ length: n }, () => newFighter(rules, { rookie: true })),
    items: [], kitPicks: {}, phase: 'creation', step: 0, parts: 0, ledger: [],
    notes: { tags: [], contacts: [], rivals: [], rumour: '', roll: [], season: [], stash: '' },
    created: now, updated: now,
  };
}

/** Choose a faction: types and kit follow it (11.1, chapter 12). */
export function setFaction(rules: Rules, crew: Crew, faction: string): Crew {
  const fr = rules.factionRules(faction);
  const fac = rules.faction(faction);
  const typeNames = fac?.types.map((t) => t.name) ?? [];
  let fighters = crew.fighters.map((f) => {
    let type = fr?.types && f.type && typeNames.includes(f.type) ? f.type : null;
    let species = f.species;
    if (fr?.typeSpecies && type && fr.typeSpecies[type]) species = fr.typeSpecies[type];
    if (isBot(rules, f) && !(fr?.specials.bots)) { species = rules.crew.limits.playableSpecies.value[0]; type = null; }
    return { ...f, type, species };
  });
  let captainId = crew.captainId;
  if (fr?.fixedRookies) {
    let i = 0;
    fighters = fighters.map((f) => (f.rookie ? { ...f, type: fr.fixedRookies![i++] ?? f.type } : f));
    if (fr.captainType) captainId = fighters.find((f) => f.type === fr.captainType)?.id ?? captainId;
  }
  // The kit itself is handed out at the kit step, once the captain is known.
  const items = crew.items.filter((o) => !o.kitRef);
  return { ...crew, faction, subfaction: null, fighters, captainId, kitPicks: {}, items };
}

export function setFighterType(rules: Rules, crew: Crew, f: Fighter, type: string | null): Fighter {
  const fr = rules.factionRules(crew.faction ?? '');
  const species = type && fr?.typeSpecies?.[type] ? fr.typeSpecies[type] : isBot(rules, f) ? rules.crew.limits.playableSpecies.value[0] : f.species;
  const forbid = rules.crew.limits.botForbiddenRating.value;
  const baseRatings = isBot(rules, { species }) && f.baseRatings[forbid] ? { ...f.baseRatings, [forbid]: 0 } : f.baseRatings;
  return { ...f, type, species, baseRatings };
}

// ---------- campaign ----------
export function addLedger(crew: Crew, amount: number, note: string): Crew {
  return { ...crew, parts: crew.parts + amount, ledger: [...crew.ledger, { id: uid('l'), at: new Date().toISOString(), amount, note }] };
}

export function finishCreation(rules: Rules, crew: Crew): Crew {
  const left = partsLeft(rules, crew);
  const items = crew.items.map((o) => {
    const d = rules.item(o.itemId);
    return { ...o, paid: o.kitRef || !d ? 0 : itemPrice(rules, crew, d) };
  });
  const fighters = crew.fighters.map((f) => ({ ...f, hirePaid: f.rookie ? rookieSurcharge(rules, crew, f) : hirePrice(rules, crew, f) }));
  return { ...crew, items, fighters, phase: 'campaign', parts: left, ledger: [{ id: uid('l'), at: new Date().toISOString(), amount: left, note: 'Crew created: parts left from the starting parts' }] };
}

/** Half the price, rounded down; full with a Fence (14.8). Drops are not sold. */
export function sellValue(rules: Rules, _crew: Crew, o: OwnedItem, fence = false): number | null {
  const d = rules.item(o.itemId);
  if (!d || d.price === null) return null;
  const base = d.price;
  if (fence) return base;
  return Math.floor(base * rules.crew.campaign.sellFraction.value);
}

export function airTax(rules: Rules, crew: Crew): { amount: number; payers: Fighter[] } {
  const t = rules.crew.campaign.airTax;
  const payers = crew.fighters.filter((f) => !t.exempt.includes(f.status));
  return { amount: payers.length * t.value, payers };
}

export function strength(crew: Crew): number {
  return crew.fighters.reduce((a, f) => a + f.xp, 0) + 10 * crew.fighters.length;
}

/** Underdog XP for the weaker crew (11.5). */
export function underdog(rules: Rules, ours: number, theirs: number): { underdog: 'us' | 'them' | null; diff: number; xp: number } {
  const u = rules.crew.underdogs.threshold;
  const diff = Math.abs(ours - theirs);
  let xp = 0;
  u.value.forEach((v, i) => { if (diff >= v) xp = u.xp[i]; });
  if (!xp) return { underdog: null, diff, xp: 0 };
  return { underdog: ours < theirs ? 'us' : 'them', diff, xp };
}

// ---------- experience ----------
export function advancesEarned(rules: Rules, xp: number): number {
  let n = 0;
  while (rules.thresholds(n + 1)[n] <= xp) n++;
  return n;
}

export function traitBudgetUsed(f: Fighter): number {
  return f.captainTraits.filter((t) => !t.retired).length
    + f.advances.filter((a) => (a.kind === 'trait' || a.kind === 'captain') && !a.retired).length
    + f.legends.filter((l) => !l.retired).length;
}

export function underTheirName(f: Fighter): string {
  return f.title ? `${f.name} "${f.title}"` : f.name;
}
