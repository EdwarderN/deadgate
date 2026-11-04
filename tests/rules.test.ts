import { describe, expect, it } from 'vitest';
import { crewOf, give, ids, otherRule, patchFighter, rules } from './helpers';
import {
  advancesEarned, airTax, beltSlots, canSpend, creditFloor, fighterStats, finishCreation, giftPrice, hirePrice, kitLines, kitPickOptions,
  partsLeft, ritesAllowed, rookieSurcharge, sellValue, sellerTarget, setFaction, setFighterType, syncKit, underdog, newCrew,
} from '../src/engine/crew';
import { validate, validators } from '../src/engine/validate';
import type { Crew } from '../src/engine/model';

const F = rules.crew.factions;
const factionWith = (pred: (n: string) => boolean) => Object.keys(F).find(pred)!;
const BODGERS = factionWith((n) => !!F[n].beltSlots);
const LEDGER = factionWith((n) => !!F[n].credit);
const WAITING = factionWith((n) => Object.values(F[n].typeGrants ?? {}).some((g) => g.gift));
const CG = factionWith((n) => !!F[n].specials.bots);
const HOLLY = factionWith((n) => !!F[n].fixedRookies);
const INSP = factionWith((n) => F[n].startingKit.some((k) => k.assign === 'captain'));
const plainFaction = factionWith((n) => !F[n].types && !F[n].priceRules && !F[n].credit && !F[n].beltSlots);

const copy = (k: string) => `${k}|copy`;
const old = (k: string) => `${k}|old stock`;
const anyCopy = rules.shopItems.find((i) => i.source === 'copy' && (i.price ?? 0) > 1)!;
const human = rules.crew.limits.playableSpecies.value[0];
const [GS1, GS2] = rules.crew.limits.giftSpecies.value;
const noGift = rules.crew.limits.playableSpecies.value.find((s) => !rules.crew.limits.giftSpecies.value.includes(s) && s !== human)!;
const R = rules.crew.limits.ratingNames.value;
const one = (r: string) => Object.fromEntries(R.map((n) => [n, n === r ? 1 : 0]));
const v = (name: keyof typeof validators, c: Crew) => validators[name]({ rules, crew: c });

describe('a legal starting crew', () => {
  it('each faction builds a crew with no errors once kit is chosen', () => {
    for (const f of rules.factions) {
      let c = crewOf(f.name);
      for (const l of kitLines(rules, c)) if (l.pick) c = { ...c, kitPicks: { ...c.kitPicks, [l.ref]: kitPickOptions(rules, c, l.pick)[0].id } };
      c = syncKit(rules, c);
      const errs = validate(rules, c).filter((m) => m.level === 'error');
      expect(errs, f.name).toEqual([]);
      expect(partsLeft(rules, c), f.name).toBe(rules.crew.creation.startingParts.value);
    }
  });
});

describe('prices (11.1, 11.3, chapter 12)', () => {
  it('a species that costs more than a rookie pays the difference', () => {
    const c = crewOf(plainFaction);
    const pricey = rules.crew.limits.playableSpecies.value.find((s) => rules.recruitPrices[s] > rules.crew.creation.rookieBasePrice.value)!;
    const c2 = patchFighter(c, 1, { species: pricey });
    expect(rookieSurcharge(rules, c2, c2.fighters[1])).toBe(rules.recruitPrices[pricey] - rules.crew.creation.rookieBasePrice.value);
    expect(partsLeft(rules, c2)).toBe(rules.crew.creation.startingParts.value - rookieSurcharge(rules, c2, c2.fighters[1]));
  });
  it('volunteers are cheaper under the control sample, but not for the subfaction that replaces it', () => {
    const pr = F[CG].priceRules!.find((p) => p.kind === 'recruitPrice')!;
    const c = crewOf(CG, undefined, undefined, otherRule(CG, pr.rule));
    expect(hirePrice(rules, c, { species: human, type: pr.recruit! })).toBe(pr.price);
    // any subfaction may give up the control sample for its own rule (12.1, 12.6 Specials)
    for (const s of rules.faction(CG)!.subfactions) {
      const c2 = crewOf(CG, s.name, undefined, pr.rule);
      expect(hirePrice(rules, c2, { species: human, type: pr.recruit! })).toBe(F[CG].specials.volunteer);
    }
  });
  it('a chassis discount subfaction makes chassis cheaper', () => {
    const pr = F[CG].priceRules!.find((p) => p.kind === 'chassisDiscount')!;
    const chassis = Object.keys(rules.chassis).sort((a, b) => rules.recruitPrices[b] - rules.recruitPrices[a])[0];
    const bot = rules.crew.limits.botSpecies.value;
    expect(hirePrice(rules, crewOf(CG, pr.subfaction), { species: bot, type: chassis })).toBe(rules.recruitPrices[chassis] - pr.amount!);
    const other = rules.faction(CG)!.subfactions.find((x) => x.name !== pr.subfaction)!.name;
    expect(hirePrice(rules, crewOf(CG, other), { species: bot, type: chassis })).toBe(rules.recruitPrices[chassis]);
  });
  it('the Waiting pay half for specials, and Priests and Seers get them free', () => {
    const c = crewOf(WAITING);
    expect(giftPrice(rules, c, { type: null })).toBe(F[WAITING].specials.gift);
    const giftType = Object.entries(F[WAITING].typeGrants!).find(([, g]) => g.gift)![0];
    expect(giftPrice(rules, c, { type: giftType })).toBe(0);
    expect(giftPrice(rules, crewOf(CG), { type: null })).toBeNull();
  });
  it('the Haggler finds old stock on a lower roll', () => {
    const m = rules.crew.creation.oldStockSeller.modifiers[0];
    const c = crewOf(plainFaction);
    expect(sellerTarget(rules, c).value).toBe(rules.crew.creation.oldStockSeller.value);
    const c2 = { ...c, fighters: c.fighters.map((f) => (f.id === c.captainId ? { ...f, captainTraits: [{ name: m.captainTrait }] } : f)) };
    expect(sellerTarget(rules, c2).value).toBe(m.value);
  });
  it('Ledgerhands may go into debt down to their credit', () => {
    const c = crewOf(LEDGER);
    expect(creditFloor(rules, c).value).toBe(F[LEDGER].credit!.value);
    expect(canSpend(rules, c, rules.crew.creation.startingParts.value - F[LEDGER].credit!.value)).toBe(true);
    expect(canSpend(rules, c, rules.crew.creation.startingParts.value - F[LEDGER].credit!.value + 1)).toBe(false);
    expect(canSpend(rules, crewOf(plainFaction), rules.crew.creation.startingParts.value + 1)).toBe(false);
  });
  it('selling pays half, rounded down, or full with a Fence', () => {
    const c = give(crewOf(plainFaction), null, anyCopy.id);
    const o = c.items[c.items.length - 1];
    expect(sellValue(rules, c, o)).toBe(Math.floor(anyCopy.price! / 2));
    expect(sellValue(rules, c, o, true)).toBe(anyCopy.price);
  });
});

describe('budget validator', () => {
  it('over budget is an error; Ledgerhands credit is a warning', () => {
    const big = rules.shopItems.sort((a, b) => b.price! - a.price!)[0];
    let c = crewOf(plainFaction);
    for (let i = 0; i < 2; i++) c = give(c, null, big.id);
    expect(ids(v('budget', c))).toContain('budget');
    let l = crewOf(LEDGER);
    const spend = rules.crew.creation.startingParts.value + 5;
    while (rules.crew.creation.startingParts.value - spend < partsLeft(rules, l)) l = give(l, null, copy('knife'));
    expect(partsLeft(rules, l)).toBeLessThan(0);
    expect(ids(v('budget', l))).toEqual([]);
    expect(ids(v('budget', l), 'warning')).toContain('budget');
  });
});

describe('rookies (4.2, 4.3, 11.1)', () => {
  it('needs exactly one rating at 1', () => {
    expect(ids(v('ratings', patchFighter(crewOf(plainFaction), 0, { baseRatings: one('') })))).toContain('ratings');
    const two = { ...one(R[0]), [R[1]]: 1 };
    expect(ids(v('ratings', patchFighter(crewOf(plainFaction), 0, { baseRatings: two })))).toContain('ratings');
  });
  it('a crew starts with four rookies and never has more than nine fighters', () => {
    const c = crewOf(plainFaction);
    expect(ids(v('rookieCount', { ...c, fighters: c.fighters.slice(1) }))).toContain('rookieCount');
    const many = { ...c, fighters: Array.from({ length: rules.crew.limits.maxFighters.value + 1 }, (_, i) => ({ ...c.fighters[0], id: `f${i}`, rookie: false })) };
    expect(ids(v('maxFighters', many))).toContain('maxFighters');
  });
  it('only the Control Group fields bots, and a bot never has Nerve', () => {
    const bot = rules.crew.limits.botSpecies.value;
    expect(ids(v('species', patchFighter(crewOf(plainFaction), 0, { species: bot })))).toContain('species');
    const nerve = rules.crew.limits.botForbiddenRating.value;
    const c = patchFighter(crewOf(CG), 0, { species: bot, type: Object.keys(rules.chassis)[0], baseRatings: one(nerve) });
    expect(ids(v('botRating', c))).toContain('botRating');
  });
  it('a chassis type makes the fighter a bot', () => {
    const c = crewOf(CG);
    const f = setFighterType(rules, c, c.fighters[0], Object.keys(rules.chassis)[0]);
    expect(f.species).toBe(rules.crew.limits.botSpecies.value);
  });
  it('a type is required where the faction has types, and wrong species are caught', () => {
    expect(ids(v('types', patchFighter(crewOf(WAITING), 0, { type: null })))).toContain('types');
    expect(ids(v('types', patchFighter(crewOf(plainFaction), 0, { type: 'Anything' })))).toContain('types');
    const seer = Object.entries(F[WAITING].typeGrants!).find(([, g]) => g.speciesOnly)![0];
    expect(ids(v('types', patchFighter(crewOf(WAITING), 0, { type: seer, species: human })))).toContain('types');
    expect(ids(v('types', patchFighter(crewOf(CG), 0, { type: 'Volunteer', species: noGift })))).toContain('types');
  });
  it("Hollowood's four rookies are fixed, and the Director is captain", () => {
    const c = crewOf(HOLLY);
    expect(c.fighters.map((f) => f.type)).toEqual(F[HOLLY].fixedRookies);
    expect(c.fighters.find((f) => f.id === c.captainId)!.type).toBe(F[HOLLY].captainType);
    const swapped = patchFighter(c, 1, { type: F[HOLLY].fixedRookies![2] });
    expect(ids(v('types', swapped))).toContain('types');
    const otherCap = { ...c, captainId: c.fighters.find((f) => f.type !== F[HOLLY].captainType)!.id };
    expect(ids(v('captain', otherCap))).toContain('captain');
  });
});

describe('captain (11.2)', () => {
  it('needs a captain with one captain trait', () => {
    const c = crewOf(plainFaction);
    expect(ids(v('captain', { ...c, captainId: null }))).toContain('captain');
    expect(ids(v('captain', patchFighter(c, 0, { captainTraits: [] })))).toContain('captain');
    expect(ids(v('captain', patchFighter(c, 0, { captainTraits: rules.captainTraits.slice(0, 2).map((t) => ({ name: t.name })) })))).toContain('captain');
    expect(ids(v('captain', patchFighter(c, 1, { captainTraits: [{ name: rules.captainTraits[1].name }] })))).toContain('captain');
  });
});

describe('starting kit (chapter 12)', () => {
  it('is free and assigned as the faction says', () => {
    const c = crewOf(INSP);
    const cap = c.fighters.find((f) => f.id === c.captainId)!;
    expect(c.items.some((o) => o.kitRef && o.fighterId === cap.id)).toBe(true);
    expect(partsLeft(rules, c)).toBe(rules.crew.creation.startingParts.value);
  });
  it('a kit choice must be made and must be legal', () => {
    const c = crewOf(WAITING);
    expect(ids(v('kit', c))).toContain('kit');
    const l = kitLines(rules, c).find((x) => x.pick)!;
    const tooDear = rules.shopItems.find((i) => i.kind === l.pick!.kind && (i.price ?? 0) > l.pick!.maxPrice)!;
    expect(ids(v('kit', { ...c, kitPicks: { [l.ref]: tooDear.id } }))).toContain('kit');
    expect(kitPickOptions(rules, c, l.pick!).every((i) => (i.price ?? 0) <= l.pick!.maxPrice)).toBe(true);
  });
  it('changing faction removes the old kit', () => {
    const c = setFaction(rules, crewOf(BODGERS), INSP);
    expect(c.items.filter((o) => o.kitRef)).toEqual([]);
  });
});

describe('shop rules', () => {
  it('old stock without a seller is a warning; a failed roll is an error', () => {
    const it1 = rules.shopItems.find((i) => i.source === 'old stock' && i.kind === 'device')!;
    expect(ids(v('seller', give(crewOf(plainFaction), null, it1.id, 'stash', { seller: 'needed' })), 'warning')).toContain('seller');
    expect(ids(v('seller', give(crewOf(plainFaction), null, it1.id, 'stash', { seller: 'none' })))).toContain('seller');
  });
  it('faction-only items are refused to others', () => {
    const r = rules.crew.gear.restrictedItems.value[0];
    const item = rules.shopItems.find((i) => i.key === r.key)!;
    expect(ids(v('restricted', give(crewOf(plainFaction), null, item.id)))).toContain('restricted');
    expect(ids(v('restricted', give(crewOf(r.factions[0]), null, item.id)))).toEqual([]);
  });
});

describe('slots (7.1, 7.4, 7.5)', () => {
  const bare = (): Crew => ({ ...crewOf(plainFaction), items: [] });
  const twoHanded = rules.shopItems.find((i) => i.kind === 'weapon' && i.hands === 2 && i.source === 'copy')!;
  const oneHanded = rules.shopItems.find((i) => i.kind === 'weapon' && i.hands === 1 && i.source === 'copy')!;
  it('a Hands set holds up to 2 Hands', () => {
    let c = give(bare(), 0, twoHanded.id, 'set1');
    expect(ids(v('slots', c))).toEqual([]);
    c = give(c, 0, oneHanded.id, 'set1');
    expect(ids(v('slots', c))).toContain('slots');
  });
  it('the belt holds 3 slots, or more under a faction rule while it is kept (7.1, 12.2)', () => {
    const dev = rules.shopItems.find((i) => i.slot === 'belt' && i.source === 'copy')!;
    const fill = (c: Crew, n: number) => { for (let i = 0; i < n; i++) c = give(c, 0, dev.id, 'belt'); return c; };
    const p = { ...crewOf(plainFaction), items: [] };
    expect(beltSlots(rules, p)).toBe(rules.crew.gear.beltSlots.value);
    let c = fill(p, rules.crew.gear.beltSlots.value);
    expect(ids(v('slots', c))).toEqual([]);
    expect(ids(v('slots', give(c, 0, dev.id, 'belt')))).toContain('slots');
    const extra = F[BODGERS].beltSlots!;
    const b = { ...crewOf(BODGERS, undefined, undefined, otherRule(BODGERS, extra.rule)), items: [] };
    expect(beltSlots(rules, b)).toBe(extra.value);
    c = fill(b, extra.value);
    expect(ids(v('slots', c))).toEqual([]);
    expect(ids(v('slots', give(c, 0, dev.id, 'belt')))).toContain('slots');
    expect(beltSlots(rules, { ...b, replacedRule: extra.rule })).toBe(rules.crew.gear.beltSlots.value);
  });
  it('one armour; a military frame fills the body; heavy armour with no frame', () => {
    const g = rules.crew.gear.frameKeys.value;
    expect(ids(v('slots', give(give(bare(), 0, copy('light armour'), 'body'), 0, copy('medium armour'), 'body')))).toContain('slots');
    expect(ids(v('slots', give(give(bare(), 0, old(g.military), 'frame'), 0, copy('light armour'), 'body')))).toContain('slots');
    expect(ids(v('slots', give(give(bare(), 0, old(g.civilian), 'frame'), 0, copy(rules.crew.gear.heavyArmourKey.value), 'body')))).toContain('slots');
    expect(ids(v('slots', give(give(bare(), 0, old(g.civilian), 'frame'), 0, copy('medium armour'), 'body')))).toEqual([]);
  });
  it('a heavy weapon needs a military frame mount', () => {
    const heavy = rules.shopItems.find((i) => i.mount)!;
    expect(ids(v('slots', give(bare(), 0, heavy.id, 'mount')))).toContain('slots');
    expect(ids(v('slots', give(give(bare(), 0, old(rules.crew.gear.frameKeys.value.military), 'frame'), 0, heavy.id, 'mount')))).toEqual([]);
    expect(ids(v('slots', give(bare(), 0, heavy.id, 'set1')))).toContain('slots');
  });
  it('a prosthetic leg needs a lost leg', () => {
    const [legKey, injury] = Object.entries(rules.crew.gear.prosthetics.value).find(([, inj]) => rules.crew.gear.injuryEffects.value[inj]?.moveHalved)!;
    const leg = rules.shopItems.find((i) => i.key === legKey)!;
    expect(ids(v('slots', give(bare(), 0, leg.id, 'fitted')))).toContain('slots');
    expect(ids(v('slots', give(patchFighter(bare(), 0, { injuries: [injury] }), 0, leg.id, 'fitted')))).toEqual([]);
  });
});

describe('stats', () => {
  it('Move, Hands, Save and Energy follow species, chassis and gear', () => {
    let c = crewOf(plainFaction);
    const sp = rules.species.find((s) => s.name === human)!;
    expect(fighterStats(rules, c, c.fighters[0]).move).toBe(sp.move);
    const four = Object.keys(rules.crew.gear.handsInUse.value).find((k) => rules.species.some((s) => s.name === k))!;
    c = patchFighter(c, 1, { species: four });
    expect(fighterStats(rules, c, c.fighters[1]).hands).toBe(rules.crew.gear.handsInUse.value[four]);
    c = give(c, 0, old(rules.crew.gear.frameKeys.value.military), 'frame');
    const st = fighterStats(rules, c, c.fighters[0]);
    expect(st.energy).toBe(rules.crew.gear.battery.value.militaryFrame);
    expect(st.save).toBe(rules.crew.gear.saveDice.value[rules.crew.gear.frameKeys.value.military]);
    expect(st.move).toBe(sp.move! + rules.crew.gear.moveModifiers.value[rules.crew.gear.frameKeys.value.military]);
    const arm = rules.shopItems.find((i) => i.handsBonus > 0)!;
    c = give(c, 2, arm.id, 'belt');
    expect(fighterStats(rules, c, c.fighters[2]).hands).toBe(rules.crew.gear.handsInUse.value.default + arm.handsBonus);
  });
  it('a lost leg halves Move, rounded up, and a leg fixes it', () => {
    const inj = Object.entries(rules.crew.gear.injuryEffects.value).find(([, e]) => e.moveHalved)!;
    let c = patchFighter(crewOf(plainFaction), 0, { injuries: [inj[0]] });
    const base = rules.species.find((s) => s.name === human)!.move!;
    expect(fighterStats(rules, c, c.fighters[0]).move).toBe(Math.ceil(base / 2));
    const [legKey, fix] = Object.entries(inj[1].fixedBy!)[0];
    c = give(c, 0, rules.shopItems.find((i) => i.key === legKey)!.id, 'fitted');
    expect(fighterStats(rules, c, c.fighters[0]).move).toBe(base + fix.move);
  });
});

describe('specials (4.3, 8.3, 11.4)', () => {
  it("only gift species can have the gift, in the book's words", () => {
    const c = patchFighter(crewOf(plainFaction), 0, { species: noGift, gift: true });
    const m = v('gift', c);
    expect(m[0].text).toBe(`A ${noGift} can't have the gift. Only ${GS1} and ${GS2}s can (4.3).`);
  });
  it('at most two gifted fighters', () => {
    let c = crewOf(plainFaction);
    for (let i = 0; i < 3; i++) c = patchFighter(c, i, { species: GS1, gift: true });
    expect(ids(v('gift', c))).toContain('gift');
  });
  it('a faction with no psions cannot buy the gift', () => {
    expect(ids(v('gift', patchFighter(crewOf(CG), 0, { species: GS1, gift: true })))).toContain('gift');
  });
  it('a priest knows one rite, a Waiting priest too (8.3, 12.4)', () => {
    const c = patchFighter(crewOf(plainFaction), 0, { rites: true });
    expect(ritesAllowed(rules, c, c.fighters[0])).toBe(1);
    const w = patchFighter(crewOf(WAITING), 0, { rites: true });
    expect(ritesAllowed(rules, w, w.fighters[0])).toBe(1);
    expect(ids(v('rites', patchFighter(c, 0, { ritesKnown: rules.rites.slice(0, 2) })))).toContain('rites');
    expect(ids(v('rites', c), 'warning')).toContain('rites');
  });
  it('a relic warns when its carrier cannot use it', () => {
    const relic = rules.shopItems.find((i) => i.kind === 'relic')!;
    const c = give(crewOf(plainFaction), 0, relic.id);
    expect(ids(v('rites', c), 'warning')).toContain('rites');
    const other = rules.rites.find((r) => r !== relic.rite)!;
    expect(ids(v('rites', patchFighter(c, 0, { rites: true, ritesKnown: [other] })), 'warning')).toContain('rites');
    expect(ids(v('rites', patchFighter(c, 0, { rites: true, ritesKnown: [relic.rite!] })), 'warning')).toEqual([]);
  });
});

describe('campaign (13.4, 4.4, 13.2, 14.3, 11.5)', () => {
  const trait = (list: string, i = 0) => rules.advanceDefs.filter((d) => d.list === list && !d.needs)[i];
  const common = rules.crew.experience.commonList.value;
  it('advances come from crossing thresholds', () => {
    const t = rules.thresholds(3);
    expect(advancesEarned(rules, t[0] - 1)).toBe(0);
    expect(advancesEarned(rules, t[0])).toBe(1);
    expect(advancesEarned(rules, t[2])).toBe(3);
    const c = patchFighter(crewOf(plainFaction), 0, { xp: 0, advances: [{ id: 'a', kind: 'trait', list: common, name: trait(common).name }] });
    expect(ids(v('advances', c))).toContain('advances');
  });
  it('a rating list needs that rating at 1', () => {
    const t = trait(R[1]);
    const c = patchFighter(crewOf(plainFaction), 0, { baseRatings: one(R[0]), xp: 100, advances: [{ id: 'a', kind: 'trait', list: R[1], name: t.name }] });
    expect(ids(v('advances', c))).toContain('advances');
    const ok = patchFighter(c, 0, { baseRatings: one(R[1]) });
    expect(ids(v('advances', ok))).toEqual([]);
  });
  it('no two rating advances in a row; ratings stop at 2 without the Ace', () => {
    const c = patchFighter(crewOf(plainFaction), 0, { xp: 100, advances: [{ id: 'a', kind: 'rating', rating: R[1] }, { id: 'b', kind: 'rating', rating: R[2] }] });
    expect(ids(v('advances', c))).toContain('advances');
    const c2 = patchFighter(crewOf(plainFaction), 0, { baseRatings: one(R[0]), xp: 100, advances: [{ id: 'a', kind: 'rating', rating: R[0] }, { id: 'b', kind: 'trait', list: common, name: trait(common).name }, { id: 'c', kind: 'rating', rating: R[0] }] });
    expect(ids(v('advances', c2))).toContain('advances');
  });
  it('the Ace: from the third advance, a 2 becomes 3, once', () => {
    const adv = (xs: object[]) => patchFighter(crewOf(plainFaction), 0, { baseRatings: one(R[0]), xp: 200, advances: xs.map((x, i) => ({ id: `a${i}`, ...x })) as never });
    const t0 = { kind: 'trait', list: common, name: trait(common, 0).name };
    const t1 = { kind: 'trait', list: common, name: trait(common, 1).name };
    expect(ids(v('advances', adv([{ kind: 'rating', rating: R[0] }, t0, { kind: 'ace', rating: R[0] }])))).toEqual([]);
    expect(ids(v('advances', adv([{ kind: 'rating', rating: R[0] }, { kind: 'ace', rating: R[0] }])))).toContain('advances');
    expect(ids(v('advances', adv([t0, t1, { kind: 'ace', rating: R[0] }])))).toContain('advances');
  });
  it('bots never raise Nerve', () => {
    const nerve = rules.crew.limits.botForbiddenRating.value;
    const c = patchFighter(crewOf(CG), 0, { species: rules.crew.limits.botSpecies.value, type: Object.keys(rules.chassis)[0], xp: 50, advances: [{ id: 'a', kind: 'rating', rating: nerve }] });
    expect(ids(v('advances', c))).toContain('advances');
  });
  it('a trait is taken once; rite advances need Rites', () => {
    const t = trait(common);
    expect(ids(v('advances', patchFighter(crewOf(plainFaction), 0, { xp: 100, advances: [{ id: 'a', kind: 'trait', list: common, name: t.name }, { id: 'b', kind: 'trait', list: common, name: t.name }] })))).toContain('advances');
    const rite = rules.advanceDefs.find((d) => d.needs)!;
    const c = patchFighter(crewOf(plainFaction), 0, { baseRatings: one(rite.list), xp: 100, advances: [{ id: 'a', kind: 'trait', list: rite.list, name: rite.name }] });
    expect(ids(v('advances', c))).toContain('advances');
    expect(ids(v('advances', patchFighter(c, 0, { rites: true, ritesKnown: [] })))).toEqual([]);
  });
  it('the trait budget is five', () => {
    const many = rules.advanceDefs.filter((d) => d.list === common).slice(0, rules.crew.limits.traitBudget.value);
    const c = patchFighter(crewOf(plainFaction), 0, { xp: 500, advances: many.map((d, i) => ({ id: `a${i}`, kind: 'trait' as const, list: common, name: d.name })) });
    expect(ids(v('traitBudget', c))).toContain('traitBudget');
    const retired = patchFighter(c, 0, { advances: c.fighters[0].advances.map((a, i) => (i === 0 ? { ...a, retired: true } : a)) });
    expect(ids(v('traitBudget', retired))).toEqual([]);
  });
  it('at most three lasting injuries; bots take glitches', () => {
    const inj = rules.injuries.slice(0, 4).map((i) => i.name);
    expect(ids(v('injuries', patchFighter(crewOf(plainFaction), 0, { injuries: inj })))).toContain('injuries');
    expect(ids(v('injuries', patchFighter(crewOf(plainFaction), 0, { injuries: [rules.glitches[0].name] })))).toContain('injuries');
  });
  it('air tax skips injured fighters', () => {
    let c = finishCreation(rules, crewOf(plainFaction));
    expect(airTax(rules, c).amount).toBe(c.fighters.length * rules.crew.campaign.airTax.value);
    c = patchFighter(c, 0, { status: rules.crew.campaign.airTax.exempt[0] });
    expect(airTax(rules, c).amount).toBe((c.fighters.length - 1) * rules.crew.campaign.airTax.value);
  });
  it('underdog XP follows the thresholds (the book example)', () => {
    expect(underdog(rules, 40, 130)).toEqual({ underdog: 'us', diff: 90, xp: 2 });
    expect(underdog(rules, 40, 59)).toEqual({ underdog: null, diff: 19, xp: 0 });
    expect(underdog(rules, 80, 40).underdog).toBe('them');
  });
  it('tags and contacts are capped', () => {
    const c = crewOf(plainFaction);
    expect(ids(v('notes', { ...c, notes: { ...c.notes, tags: rules.tags.slice(0, 4).map((t) => t.name) } }))).toContain('notes');
  });
  it('finishing creation keeps the parts left', () => {
    const c = give(crewOf(plainFaction), 0, anyCopy.id);
    const left = partsLeft(rules, c);
    const done = finishCreation(rules, c);
    expect(done.phase).toBe('campaign');
    expect(partsLeft(rules, done)).toBe(left);
  });
  it('a new crew has the starting rookies', () => {
    expect(newCrew(rules).fighters.length).toBe(rules.crew.creation.startingRookies.value);
  });
});

describe('a crew saved under older rules', () => {
  it('warns about names the rules no longer have', () => {
    const c = patchFighter(crewOf(Object.keys(rules.crew.factions)[0]), 0, { injuries: ['Something renamed'], sillyTrait: 'Gone trait' });
    const w = validators.staleNames({ rules, crew: { ...c, notes: { ...c.notes, tags: ['Old tag'] }, items: [...c.items, { uid: 'z', itemId: 'old gun|copy', fighterId: null, slot: 'stash' }] } });
    expect(w.length).toBe(4);
    expect(w.every((m) => m.level === 'warning')).toBe(true);
    expect(validators.staleNames({ rules, crew: crewOf(Object.keys(rules.crew.factions)[0]) })).toEqual([]);
  });
});
