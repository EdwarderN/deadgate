import { describe, expect, it } from 'vitest';
import { crewOf, rules } from './helpers';
import { applyChanges, splitTwist } from '../src/engine/outcomes';
import { finishCreation } from '../src/engine/crew';


describe('story twists', () => {
  it('a twist splits into its rating, success and failure', () => {
    expect(splitTwist('Nerve: 8 parts / 0 parts and gain Oathbreakers')).toEqual({ rating: 'Nerve', success: '8 parts', failure: '0 parts and gain Oathbreakers' });
  });
});

describe('applying changes', () => {
  it('applies parts, XP, statuses, tags (Ran and Reliable replace each other), states and leaving', () => {
    const c = finishCreation(rules, crewOf(Object.keys(rules.crew.factions)[0]));
    const [a, b] = c.fighters;
    const [ran, rel] = ['Ran', 'Reliable'];
    const { crew, lines } = applyChanges(rules, { ...c, notes: { ...c.notes, tags: [ran] } }, [
      { kind: 'parts', amount: -3, note: 'test' },
      { kind: 'xp', fid: a.id, amount: 2, note: '' },
      { kind: 'status', fid: a.id, value: rules.crew.campaign.statuses.value[1] },
      { kind: 'tag', value: rel },
      { kind: 'nextBattle', fid: a.id, value: 'Hyped' },
      { kind: 'leave', fid: b.id, fate: 'Dead', note: '' },
    ]);
    expect(crew.parts).toBe(c.parts - 3);
    expect(crew.fighters.find((f) => f.id === a.id)!.xp).toBe(2);
    expect(crew.notes.tags).toEqual([rel]);
    expect(crew.fighters.find((f) => f.id === a.id)!.nextBattle).toEqual(['Hyped']);
    expect(crew.fighters.some((f) => f.id === b.id)).toBe(false);
    expect(crew.notes.roll[0].fate).toBe('Dead');
    expect(lines.length).toBe(6);
  });
});
