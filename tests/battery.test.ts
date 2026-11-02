import { describe, expect, it } from 'vitest';
import { crewOf, give, rules } from './helpers';
import { battery, finishCreation, rechargeCost } from '../src/engine/crew';
import { newBattle, startAfterBattle } from '../src/engine/battle';
import { applyChanges } from '../src/engine/outcomes';
import { resolveEffects } from '../src/engine/effects';
import type { Crew } from '../src/engine/model';

const crew = (): Crew => finishCreation(rules, crewOf(Object.keys(rules.crew.factions)[0]));
const full = rules.crew.gear.battery.value.default;

describe('batteries between battles (14.3)', () => {
  it('a new crew starts full; what is left after a battle stays', () => {
    let c = crew();
    const f = c.fighters[0];
    expect(battery(rules, c, f)).toEqual({ now: full, max: full });
    const b = newBattle(rules, c);
    c = { ...c, battle: { ...b, fighters: { ...b.fighters, [f.id]: { ...b.fighters[f.id], energy: 1 } } } };
    c = startAfterBattle(rules, c);
    expect(battery(rules, c, c.fighters[0]).now).toBe(1);
    expect(newBattle(rules, c).fighters[f.id].energy).toBe(1);
  });
  it('a fighter who sat the battle out keeps their battery', () => {
    let c = crew();
    c = { ...c, fighters: c.fighters.map((f, i) => (i === 1 ? { ...f, energy: 2 } : f)) };
    const b = newBattle(rules, c);
    c = startAfterBattle(rules, { ...c, battle: { ...b, fighters: { ...b.fighters, [c.fighters[1].id]: { ...b.fighters[c.fighters[1].id], inBattle: false, energy: 4 } } } });
    expect(c.fighters[1].energy).toBe(2);
  });
  it('recharging costs the book price per Energy, and never past the cell size', () => {
    expect(rechargeCost(rules, 3)).toBe(3 * rules.crew.campaign.rechargePerEnergy.value);
    const c = { ...crew(), fighters: crew().fighters.map((f) => ({ ...f, energy: 1 })) };
    const one = applyChanges(rules, c, [{ kind: 'recharge', fid: c.fighters[0].id, amount: 9, note: '' }]).crew;
    expect(one.fighters[0].energy).toBe(full);
    expect(one.fighters[1].energy).toBe(1);
  });
  it('a military frame makes the battery bigger', () => {
    let c = crew();
    c = give(c, 0, `${rules.crew.gear.frameKeys.value.military}|old stock`, 'frame');
    expect(battery(rules, c, c.fighters[0]).max).toBe(rules.crew.gear.battery.value.militaryFrame);
  });
  it('task results refill batteries for free', () => {
    const c = { ...crew(), fighters: crew().fighters.map((f) => ({ ...f, energy: 0 })) };
    const all = resolveEffects(rules, c, rules.outcomes.taskTables['Scavenge']['11'], { note: '' }, {}, 't');
    const after = applyChanges(rules, c, all.changes).crew;
    expect(after.fighters.every((f) => f.energy === full)).toBe(true);
    const one = resolveEffects(rules, c, rules.outcomes.taskTables['Scavenge']['7'], { note: '' }, { 't.who:choose': c.fighters[2].id }, 't');
    expect(applyChanges(rules, c, one.changes).crew.fighters.map((f) => f.energy)).toEqual([0, 0, 2, 0]);
  });
});
