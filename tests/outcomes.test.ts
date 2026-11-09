import { describe, expect, it } from 'vitest';
import { crewOf, rules } from './helpers';
import { applyChanges, splitTwist } from '../src/engine/outcomes';
import { finishCreation } from '../src/engine/crew';


describe('story twists', () => {
  it('a twist splits into its rating, success and failure', () => {
    expect(splitTwist('Nerve: 8 parts / 0 parts and gain Oathbreakers')).toEqual({ rating: 'Nerve', difficulty: null, note: null, success: '8 parts', failure: '0 parts and gain Oathbreakers' });
    expect(splitTwist('Nerve, Routine (6): a / b')).toMatchObject({ rating: 'Nerve', difficulty: 'Routine', success: 'a', failure: 'b' });
    expect(splitTwist('Fight (-1 die if a rival gang sent them): a / b')).toMatchObject({ rating: 'Fight', difficulty: null, note: '-1 die if a rival gang sent them' });
    // every twist in the book parses, and names a difficulty the dice chapter has
    for (const rows of Object.values(rules.data.story_events)) for (const r of rows) if (r.Twist !== 'None') {
      const t = splitTwist(r.Twist);
      expect(t.rating, r.Twist).toBeTruthy();
      if (t.difficulty) expect(rules.data.difficulties.some((d) => d.Difficulty.replace(/\*\*/g, '') === t.difficulty), t.difficulty).toBe(true);
    }
  });
});

describe('applying changes', () => {
  it('applies parts, XP, statuses, tags (opposites cross each other off, 14.10), states and leaving', () => {
    const c = finishCreation(rules, crewOf(Object.keys(rules.crew.factions)[0]));
    const [a, b] = c.fighters;
    const [ran, rel] = rules.data.tag_opposites[0];
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
    expect(crew.notes.tags).toEqual([]);
    expect(crew.fighters.find((f) => f.id === a.id)!.nextBattle).toEqual(['Hyped']);
    expect(crew.fighters.some((f) => f.id === b.id)).toBe(false);
    expect(crew.notes.roll[0].fate).toBe('Dead');
    expect(lines.length).toBe(6);
  });
});
