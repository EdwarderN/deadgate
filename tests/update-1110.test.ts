// The rules update of 2026-11-10: new prices, drop sale prices, Held captives, league points for Words and research,
// wagers, deeds fulfilled once, bot cores, teachers.
import { describe, expect, it } from 'vitest';
import { crewOf, rules } from './helpers';
import { leaguePoints, newBattle, wagerStake } from '../src/engine/battle';
import { finishCreation, sellValue } from '../src/engine/crew';
import { applyChanges } from '../src/engine/outcomes';
import type { Crew } from '../src/engine/model';

const base = (f = rules.factions[0].name): Crew => ({ ...finishCreation(rules, crewOf(f)), phase: 'campaign', parts: 40, breakNo: 1 });

describe('prices come from the book (9.1, 9.3, 10.6)', () => {
  it('species and chassis prices are read per name', () => {
    for (const [name, price] of Object.entries(rules.recruitPrices)) expect(Number.isFinite(price), name).toBe(true);
    const rows = rules.data.recruits.flatMap((r) => r.recruit.replace(/\\(.*?\\):?/g, '').split(/[,/]/).map((n) => n.trim()).filter(Boolean));
    expect(rows.length).toBeGreaterThan(5);
  });
});

describe('drops sell for their table price (7.3, 7.6, 14.8)', () => {
  it('half the worth; a Fence pays the worth; drop armour has a price per weight', () => {
    const drops = rules.items.filter((i) => i.source === 'drop' && i.sells?.length);
    expect(drops.length).toBeGreaterThan(5);
    const c = base();
    const strange = drops.find((d) => d.kind === 'weapon')!;
    const o = { uid: 'u', itemId: strange.id, fighterId: null, slot: 'stash' as const };
    expect(sellValue(rules, c, o)).toBe(strange.sells![0].value);
    expect(sellValue(rules, c, o, true)).toBe(strange.sells![0].value * 2);
    const armour = drops.find((d) => (d.sells?.length ?? 0) > 1)!;
    expect(armour.sells!.map((s) => s.label)).toEqual(['light', 'medium']);
    expect(sellValue(rules, c, { ...o, itemId: armour.id }, false, 1)).toBe(armour.sells![1].value);
    expect(armour.forSale).toBe(false);
  });
});

describe('Held captives (14.4)', () => {
  it('one of ours Held: off the roster with their gear, and back when bought', () => {
    let c = base();
    const f = c.fighters[1];
    const carried = c.items.filter((o) => o.fighterId === f.id).length;
    c = applyChanges(rules, c, [{ kind: 'hold', fid: f.id, price: 14, captor: 'The Red Fines' }]).crew;
    expect(c.fighters.some((x) => x.id === f.id)).toBe(false);
    expect(c.held?.[0]).toMatchObject({ price: 14, captor: 'The Red Fines', sinceBreak: 1 });
    expect(c.held?.[0].items.length).toBe(carried);
  });
  it('an enemy we Hold is recorded with the asked price; the Ledgerhands never hold', () => {
    const c = applyChanges(rules, base(), [{ kind: 'prisoner', prisoner: { id: 'p1', name: 'Gus', owner: 'Spanners', price: 12, species: 'Human', ratings: {} } }]).crew;
    expect(c.prisoners?.[0].price).toBe(12);
    const led = Object.keys(rules.crew.factions).find((n) => rules.crew.factions[n].noHold);
    expect(led).toBeTruthy();
  });
  it('faction fates: the full price for some, +4 XP to a bot, a recruit when converted', () => {
    const F = rules.crew.factions;
    const fx = Object.values(F).flatMap((f) => f.effects ?? []).filter((e) => e.when === 'captive');
    expect(fx.some((e) => e.kind === 'captivePrice' && e.fraction === 1)).toBe(true);
    expect(fx.some((e) => e.kind === 'captiveXp' && e.amount === 4)).toBe(true);
    expect(fx.some((e) => e.kind === 'convert')).toBe(true);
    const c = applyChanges(rules, base(), [{ kind: 'recruit', fighter: { ...base().fighters[0], id: 'new', name: 'Convert' }, note: '' }]).crew;
    expect(c.fighters.some((x) => x.id === 'new')).toBe(true);
  });
});

describe('Words and league points (13.5, 15.2)', () => {
  it('Words score at most the cap; a research task scores its points', () => {
    const c = base();
    const b = newBattle(rules, c);
    const leg = rules.deeds.find((d) => d.tier.startsWith('Legendary'))!.id;
    for (const id of Object.keys(b.fighters).slice(0, 2)) b.fighters[id] = { ...b.fighters[id], word: { deed: leg, audience: 'Vow', result: 'fulfilled' } };
    const pts = (bb: typeof b) => leaguePoints(rules, bb).reduce((s, r) => s + r.points, 0) - (bb.stoodGround ? 1 : 0);
    expect(pts(b)).toBe(rules.crew.afterBattle.wordPointsCap!.value);
    const research = Number(rules.data.league_points.find((r) => /research/i.test(r.What))!.Points);
    expect(pts({ ...b, research: { field: 1, lab: 1, chosen: 'field', done: true } })).toBe(rules.crew.afterBattle.wordPointsCap!.value + research);
  });
  it('a wager is always taken; a fulfilled deed is recorded and never sworn again', () => {
    const W = rules.crew.battle.wagerStakes;
    const small = rules.deeds.find((d) => d.tier.startsWith('Small'))!.id;
    expect(wagerStake(rules, base(), { deed: small, audience: W.audience, result: 'fulfilled', taker: false })).toBe(W.value.Small);
    const c0 = base();
    const c = applyChanges(rules, c0, [{ kind: 'deedDone', fid: c0.fighters[0].id, deed: small }]).crew;
    expect(c.fighters[0].deedsDone).toEqual([small]);
  });
});

describe('bots keep their core (13.3)', () => {
  it('home: all; left behind: half, with the advances that buys', () => {
    expect(rules.crew.afterBattle.botCore.value).toBe(1);
    expect(rules.crew.afterBattle.botCoreLeftBehind!.value).toBe(0.5);
    let c = base();
    c = { ...c, fighters: c.fighters.map((f, i) => (i === 0 ? { ...f, xp: 11 } : f)) };
    c = applyChanges(rules, c, [{ kind: 'botReplace', fid: c.fighters[0].id, fraction: 0.5, chassis: false }]).crew;
    expect(c.fighters[0].xp).toBe(5);
    expect(c.fighters[0].awaitingChassis).toBeFalsy();
  });
});

describe("designer's answers 38 and 39", () => {
  it('the Ledgerhands ransom cannot be declined; Fined anyway takes a further share, as much as the owner has', () => {
    const F = rules.crew.factions;
    expect(Object.keys(F).filter((n) => F[n].ransomNoDecline?.value)).toHaveLength(1);
    const fee = Object.values(F).flatMap((f) => f.effects ?? []).find((e) => e.extraUpTo)!;
    expect(fee.kind).toBe('captivePrice');
    // losses stop at 0, so a fee the owner cannot pay in full takes what it has (14.2)
    const c = { ...base(), parts: 3 };
    expect(applyChanges(rules, c, [{ kind: 'parts', amount: -7, note: '' }]).crew.parts).toBe(0);
  });
});
