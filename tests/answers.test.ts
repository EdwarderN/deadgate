// The designer's answers to rules questions (marked "designer's answer N" in data/manual), as rules the app follows.
import { describe, expect, it } from 'vitest';
import { crewOf, give, patchFighter, rules } from './helpers';
import { builtInOptions, fighterStats, finishCreation, partsLeft, setFighterType, slotLoad, traitBudgetUsed } from '../src/engine/crew';
import { validators } from '../src/engine/validate';
import { prefixTitle, taskPayWithTable } from '../src/engine/faction';
import { applyChanges } from '../src/engine/outcomes';
import { newBattle } from '../src/engine/battle';
import type { Crew } from '../src/engine/model';

const F = rules.crew.factions;
const CG = Object.keys(F).find((n) => F[n].specials.bots)!;
const HW = Object.keys(F).find((n) => F[n].typeLimits)!;
const v = (k: keyof typeof validators, c: Crew) => validators[k]({ rules, crew: c }).filter((m) => m.level === 'error').map((m) => m.rule);

describe("the designer's answers", () => {
  it('1. the Prototype has a free built-in copy weapon, up to the cap, chosen at hire', () => {
    const [type, tr] = Object.entries(F[CG].typeRules!).find(([, r]) => r.builtIn)!;
    let c = crewOf(CG);
    c = { ...c, fighters: c.fighters.map((f, i) => (i === 0 ? setFighterType(rules, c, f, type) : f)) };
    expect(v('builtIn', c)).toContain('builtIn');
    const opts = builtInOptions(rules, c, type)!;
    expect(opts.every((i) => i.source === tr.builtIn!.source && (i.price ?? 0) <= tr.builtIn!.maxPrice)).toBe(true);
    const before = partsLeft(rules, c);
    c = patchFighter(c, 0, { builtIn: opts[opts.length - 1].id });
    expect(v('builtIn', c)).toEqual([]);
    expect(partsLeft(rules, c)).toBe(before);
    expect(slotLoad(rules, c, c.fighters[0], 'set1')).toBe(0);
    expect(setFighterType(rules, c, c.fighters[0], null).builtIn).toBeNull();
  });
  it('2. the gift and Rites bought at hire are not trait lines', () => {
    const c = patchFighter(crewOf(Object.keys(F)[0]), 1, { gift: true, rites: true });
    expect(traitBudgetUsed(c.fighters[1])).toBe(0);
  });
  it('7. at most one Director', () => {
    const [t, max] = Object.entries(F[HW].typeLimits!.value)[0];
    const c = crewOf(HW);
    expect(v('typeLimits', c)).toEqual([]);
    const two = patchFighter(c, 1, { type: t });
    expect(c.fighters.filter((f) => f.type === t).length).toBe(max);
    expect(v('typeLimits', two)).toContain('typeLimits');
  });
  it('9. a robo-arm replacing a lost arm takes no Belt slot; a spare one does', () => {
    const [armKey, inj] = Object.entries(rules.crew.gear.prosthetics.value).find(([, i]) => rules.crew.gear.injuryEffects.value[i]?.hands)!;
    const arm = rules.shopItems.find((i) => i.key === armKey)!;
    let c = patchFighter(finishCreation(rules, crewOf(Object.keys(F)[0])), 0, { injuries: [inj] });
    const hands = fighterStats(rules, c, c.fighters[0]).hands;
    c = give(c, 0, arm.id);
    expect(c.items[c.items.length - 1].slot).toBe('fitted');
    expect(slotLoad(rules, c, c.fighters[0], 'belt')).toBe(0);
    expect(fighterStats(rules, c, c.fighters[0]).hands).toBe(hands + arm.handsBonus);
    expect(v('slots', c)).toEqual([]);
    const spare = give(finishCreation(rules, crewOf(Object.keys(F)[0])), 1, arm.id);
    expect(spare.items[spare.items.length - 1].slot).toBe('belt');
  });
  it('18. "Young" goes after any "the"', () => {
    expect(prefixTitle('the Hammer', 'Young', 'the')).toBe('the Young Hammer');
    expect(prefixTitle('Peg-Leg', 'Young', 'the')).toBe('Young Peg-Leg');
  });
  it('22. a Twist is a Tricky test', () => {
    const d = rules.data.difficulties.find((x) => x.Difficulty.includes(rules.crew.afterBattle.twistTest.value))!;
    expect(+d.Target).toBe(8);
  });
  it('24. "pays double" doubles the printed pay only; Paymaster is added once', () => {
    const m = rules.crew.taskPay.value.find((x) => x.captainTrait)!;
    let c = crewOf(Object.keys(F).find((n) => !F[n].taskPay)!);
    c = { ...c, fighters: c.fighters.map((f) => (f.id === c.captainId ? { ...f, captainTraits: [{ name: m.captainTrait! }] } : f)) };
    expect(taskPayWithTable(rules, c, m.task, true, 10, 2).parts).toBe(20 + m.parts!);
    expect(taskPayWithTable(rules, c, m.task, true, 10, 0).parts).toBe(0);
    expect(taskPayWithTable(rules, c, m.task, true, 10, 0.5).parts).toBe(Math.floor((10 + m.parts!) / 2));
  });
  it('27. a destroyed bot whose core came home waits for a chassis, bought at its hire price, and sits out until then', () => {
    let c = finishCreation(rules, crewOf(CG));
    c = applyChanges(rules, c, [{ kind: 'botReplace', fid: c.fighters[0].id, fraction: rules.crew.afterBattle.botCore.value }]).crew;
    expect(c.fighters[0].awaitingChassis).toBe(true);
    expect(newBattle(rules, c).fighters[c.fighters[0].id].inBattle).toBe(false);
    expect(validators.chassis({ rules, crew: c }).length).toBe(1);
  });
});
