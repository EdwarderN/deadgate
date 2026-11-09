import { describe, expect, it } from 'vitest';
import { crewOf, give, otherRule, patchFighter, rules } from './helpers';
import { breakingStatus, deedTier, legendFor, makesLegend, newBattle, positions, RUMOUR, sillyTableFor, startAfterBattle, wagerStake, wordXp, wordsAllowed, taskBlocked } from '../src/engine/battle';
import { activeEffects } from '../src/engine/faction';
import { finishCreation, setFighterType } from '../src/engine/crew';
import { resolveEffects } from '../src/engine/effects';
import { applyChanges } from '../src/engine/outcomes';
import { plain } from '../src/data/rules';
import type { Battle, Crew } from '../src/engine/model';

const F = rules.crew.factions;
const factionWith = (kind: string) => Object.keys(F).find((n) => F[n].effects?.some((e) => e.kind === kind))!;
const plainFaction = Object.keys(F).find((n) => !F[n].effects?.some((e) => e.when === 'breaking'))!;
const crew = (f = plainFaction, sub?: string): Crew => finishCreation(rules, crewOf(f, sub));
const pos = (pred: (p: ReturnType<typeof positions>[number]) => boolean) => positions(rules).find(pred)!.name;
const DOWN = () => pos((p) => p.injury === 'heldField');
const setF = (b: Battle, id: string, p: object): Battle => ({ ...b, fighters: { ...b.fighters, [id]: { ...b.fighters[id], ...p } } });
const eff = (c: Crew) => activeEffects(rules, c, 'breaking').map((e) => ({ ...e.effect, title: e.title }));

describe('the book data the new features read', () => {
  it('worlds, the world table and scenarios agree', () => {
    for (const r of rules.data.world_table) expect(rules.data.worlds.some((w) => w.name === plain(r.World)), r.World).toBe(true);
    for (const w of rules.data.worlds) {
      expect(w.alwaysOn).toMatch(/Always on/);
      expect(w.events.length).toBe(6);
      for (const s of w.scenarios) {
        for (const l of ['Terrain needed', 'Winning condition', 'Prize']) expect(s.sections.some((x) => x.label === l), `${s.title}: ${l}`).toBe(true);
      }
    }
  });
  it('names in the new rules exist in the book', () => {
    for (const n of Object.keys(rules.crew.campaign.contactUses.value)) expect(rules.contacts.map((c) => c.name)).toContain(n);
    for (const n of Object.keys(rules.crew.campaign.sillyEffects.value)) expect(rules.silly.map((s) => s.name)).toContain(n);
    for (const n of Object.keys(rules.crew.battle.breaking.captainTraits)) expect(rules.captainTraits.map((t) => t.name)).toContain(n);
    expect(rules.tags.map((t) => t.name)).toContain(rules.crew.battle.wagerStakes.noTakerTag);
    expect(rules.data.states.map((s) => plain(s.State))).not.toContain(rules.crew.battle.madness.value);
    expect(Object.keys(rules.data.gear_failure).length).toBe(3);
    for (const k of rules.crew.gear.singleUse.value) expect(rules.items.some((i) => i.kind === k)).toBe(true);
    expect(rules.data.final.length).toBeGreaterThan(5);
  });
});

describe('breaking (11.4)', () => {
  it('starts at half the crew, rounded up; the captain tests with Nerve', () => {
    const c = crew();
    let b = newBattle(rules, c);
    expect(breakingStatus(rules, c, b, eff(c)).needed).toBe(false);
    b = setF(setF(b, c.fighters[1].id, { position: DOWN() }), c.fighters[2].id, { position: DOWN() });
    const s = breakingStatus(rules, c, b, eff(c));
    expect(s).toMatchObject({ needed: true, out: 2, total: 4, threshold: 2 });
    expect(s.tester?.id).toBe(c.captainId);
  });
  it('a downed captain hands the test to the best Nerve standing', () => {
    const c = crew();
    const nerve = rules.crew.battle.breaking.rating;
    const c2 = patchFighter(c, 3, { baseRatings: Object.fromEntries(rules.crew.limits.ratingNames.value.map((r) => [r, r === nerve ? 1 : 0])) });
    const b = setF(setF(newBattle(rules, c2), c2.captainId!, { position: DOWN() }), c2.fighters[1].id, { position: DOWN() });
    expect(breakingStatus(rules, c2, b, eff(c2)).tester?.id).toBe(c2.fighters[3].id);
  });
  it('a faction can raise the threshold, or add dice to the test', () => {
    const cg = factionWith('breakingThreshold');
    const e = F[cg].effects!.find((x) => x.kind === 'breakingThreshold')!;
    const c = { ...crew(cg), replacedRule: otherRule(cg, e.rule) };
    const b = setF(setF(newBattle(rules, c), c.fighters[1].id, { position: DOWN() }), c.fighters[2].id, { position: DOWN() });
    expect(breakingStatus(rules, c, b, eff(c))).toMatchObject({ threshold: Math.ceil(4 * e.fraction!), needed: false });
    const w = Object.keys(F).find((n) => F[n].effects?.some((x) => x.kind === 'breakingDice' && !x.captain))!;
    const we = F[w].effects!.find((x) => x.kind === 'breakingDice' && !x.captain)!;
    const wc = { ...crew(w), replacedRule: otherRule(w, we.rule) };
    const before = breakingStatus(rules, crew(), newBattle(rules, crew()), []).dice;
    expect(breakingStatus(rules, wc, newBattle(rules, wc), eff(wc)).dice).toBe(before + we.amount!);
  });
  it('only bots standing: no test', () => {
    const cg = Object.keys(F).find((n) => F[n].specials.bots)!;
    let c = crew(cg);
    c = { ...c, fighters: c.fighters.map((f, i) => (i === 0 ? setFighterType(rules, c, f, Object.keys(rules.chassis)[0]) : f)) };
    let b = newBattle(rules, c);
    for (const f of c.fighters.slice(1)) b = setF(b, f.id, { position: DOWN() });
    expect(breakingStatus(rules, c, b, []).never).toBe(true);
  });
});

describe('Words: wagers, rumours, the Final', () => {
  const big = rules.deeds.find((d) => d.tier === 'Big deeds')!.id;
  it('a wager pays or costs its stake, unless nobody took it', () => {
    const c = crew();
    const W = rules.crew.battle.wagerStakes;
    expect(wagerStake(rules, c, { deed: big, audience: W.audience, result: 'fulfilled' })).toBe(W.value.Big);
    expect(wagerStake(rules, c, { deed: big, audience: W.audience, result: 'failed' })).toBe(-W.value.Big);
    expect(wagerStake(rules, c, { deed: big, audience: W.audience, result: 'failed', taker: false })).toBe(0);
    expect(wagerStake(rules, { ...c, notes: { ...c.notes, tags: [W.noTakerTag] } }, { deed: big, audience: W.audience, result: 'failed' })).toBe(0);
  });
  it("an arrival's rumour is a Big vow worth its own XP, with its Legend; failing it takes a sillier trait", () => {
    const name = plain(rules.data.rumours[0].Rumour).split('.')[0];
    const id = `${RUMOUR}${name}`;
    expect(deedTier(rules, id)?.tier).toBe(rules.crew.battle.rumourWord.tier);
    expect(wordXp(rules, { deed: id, audience: rules.crew.battle.rumourWord.audience, result: 'fulfilled' })).toBe(rules.crew.battle.rumourWord.value);
    expect(legendFor(rules, id)?.title).toBeTruthy();
    expect(sillyTableFor(rules, id)).toBe(rules.crew.battle.rumourWord.silly);
    expect(makesLegend(rules, id)).toBe(true);
    let c = crew();
    c = applyChanges(rules, c, [{ kind: 'rumourPick', fid: c.fighters[0].id, value: name }]).crew;
    expect(c.fighters[0].rumour?.name).toBe(name);
    c = applyChanges(rules, c, [{ kind: 'rumourEnd', fid: c.fighters[0].id, fulfilled: false }]).crew;
    expect(c.fighters[0].rumour).toEqual({ name: null, disproved: [name] });
  });
  it('the Final has its own number of Words, with nothing added', () => {
    const c = crew();
    expect(wordsAllowed(rules, c, { ...newBattle(rules, c), final: true })).toBe(rules.crew.final.words.value);
  });
});

describe('after the battle', () => {
  it('the prize pays parts and a finds roll; the Final pays more', () => {
    const c = crew();
    const p = resolveEffects(rules, c, rules.outcomes.prize, { note: '' }, { 'p.1': [1] }, 'p');
    expect(p.changes).toEqual([{ kind: 'parts', amount: 10, note: '' }, { kind: 'parts', amount: 4, note: '' }]);
    expect(resolveEffects(rules, c, rules.outcomes.finalPrize, { note: '' }, {}, 'p').missing).toContain('roll on the finds table');
  });
  it('thrown grenades are used up: a pair has two', () => {
    let c = crew();
    const g = rules.shopItems.find((i) => rules.crew.gear.singleUse.value.includes(i.kind))!;
    c = give(c, 0, g.id, 'belt');
    const uid = c.items[c.items.length - 1].uid;
    const b = newBattle(rules, c);
    const once = startAfterBattle(rules, { ...c, battle: setF(b, c.fighters[0].id, { thrown: { [uid]: 1 } }) });
    expect(once.items.find((o) => o.uid === uid)?.used).toBe(1);
    const twice = startAfterBattle(rules, { ...c, battle: setF(b, c.fighters[0].id, { thrown: { [uid]: rules.crew.gear.singleUse.uses } }) });
    expect(twice.items.some((o) => o.uid === uid)).toBe(false);
  });
  it("a bot left behind loses its core; a destroyed bot whose core came home keeps half", () => {
    const cg = Object.keys(F).find((n) => F[n].specials.bots)!;
    let c = crew(cg);
    c = { ...c, fighters: c.fighters.map((f, i) => (i === 0 ? { ...setFighterType(rules, c, f, Object.keys(rules.chassis)[0]), xp: 11, legends: [{ id: 'l', name: rules.legends[0].name, title: 'X' }] } : f)) };
    const id = c.fighters[0].id;
    const lost = applyChanges(rules, c, [{ kind: 'botCoreLost', fid: id }]).crew;
    expect(lost.fighters[0]).toMatchObject({ xp: 0, advances: [], legends: [] });
    expect(lost.notes.roll[0].titles).toContain('X');
    const half = applyChanges(rules, c, [{ kind: 'botReplace', fid: id, fraction: rules.crew.afterBattle.botCore.value }]).crew;
    expect(half.fighters[0].xp).toBe(Math.floor(11 * rules.crew.afterBattle.botCore.value));
    const dead = resolveEffects(rules, c, [{ dead: true }], { self: id, coreHome: true, note: '' }, {}, 'x');
    expect(dead.changes[0].kind).toBe('botReplace');
    expect(resolveEffects(rules, c, [{ dead: true }], { self: id, coreHome: false, note: '' }, {}, 'x').changes[0].kind).toBe('leave');
  });
  it('a contact is used once', () => {
    const c = { ...crew(), notes: { ...crew().notes, contacts: [{ name: 'Fixer', used: false }, { name: 'Patron', used: false }] } };
    const after = applyChanges(rules, c, [{ kind: 'useContact', name: 'Patron', why: '' }]).crew;
    expect(after.notes.contacts).toEqual([{ name: 'Fixer', used: false }, { name: 'Patron', used: true }]);
  });
  it('a fighter hired this break takes no task', () => {
    const c = { ...crew(), breakNo: 3 };
    expect(taskBlocked(rules, { ...c.fighters[0], hiredBreak: 3 }, c)).toBe(true);
    expect(taskBlocked(rules, { ...c.fighters[0], hiredBreak: 2 }, c)).toBe(false);
  });
  it('a failed Word remembers its tier (for "Doubled down")', () => {
    const c = crew();
    const s = rules.silly.find((x) => rules.crew.campaign.sillyEffects.value[x.name]?.tierUp)!;
    const after = applyChanges(rules, c, [{ kind: 'silly', fid: c.fighters[0].id, value: s.name, tier: 'Big' }]).crew;
    expect(after.fighters[0]).toMatchObject({ sillyTrait: s.name, lastFailedTier: 'Big' });
  });
});
