import { describe, expect, it } from 'vitest';
import { crewOf, rules } from './helpers';
import { applyChanges, readOutcomes, splitTwist } from '../src/engine/outcomes';
import { finishCreation } from '../src/engine/crew';

const kinds = (text: string, opts = { note: '' }) => readOutcomes(rules, text, opts).map((o) => `${o.change.kind}:${'amount' in o.change ? o.change.amount : 'value' in o.change ? o.change.value : ''}`);

describe('reading table results', () => {
  it('parts: gains, costs, and things that are not parts', () => {
    expect(kinds('**+3 parts**')).toEqual(['parts:3']);
    expect(kinds('Lose 4 parts')).toEqual(['parts:-4']);
    expect(kinds('Hand over **3 parts**, or keep everything')).toEqual(['parts:-3']);
    expect(kinds('One rookie may be hired for 5 parts less')).toEqual([]);
    expect(kinds('a copy weapon or armour worth up to 8 parts')).toEqual([]);
    expect(kinds('pay 8')).toEqual(['parts:-8']);
    expect(kinds('5 parts', { note: '', cost: true } as never)).toEqual(['parts:-5']);
  });
  it('XP, statuses, next-battle states, tags, contacts and silly traits', () => {
    expect(kinds('**+1 XP**, and the crew gains **Showboats**')).toEqual(['xp:1', 'tag:Showboats']);
    expect(kinds('The fighter is **Laid up**')).toEqual(['status:Laid up']);
    expect(kinds('starts the next battle **Hyped** and **Under warranty**')).toEqual(['nextBattle:Hyped', 'nextBattle:Under warranty']);
    expect(kinds('gain the contact **Informer**')).toEqual(['contact:Informer']);
    expect(kinds('gets the silly trait "Jittery" (section 13.7)')).toEqual(['silly:Jittery']);
  });
  it('a choice in the text leaves the outcomes unticked', () => {
    expect(readOutcomes(rules, 'Pay **3 parts**, or forge one').every((o) => !o.checked)).toBe(true);
    expect(readOutcomes(rules, '**+3 parts**').every((o) => o.checked)).toBe(true);
  });
  it('a twist splits into its rating, success and failure', () => {
    expect(splitTwist('Nerve: 8 parts / 0 parts and gain Oathbreakers')).toEqual({ rating: 'Nerve', success: '8 parts', failure: '0 parts and gain Oathbreakers' });
  });
  it('every story event, task, injury and finds row can be read without error', () => {
    const texts = [
      ...Object.values(rules.data.story_events).flat().flatMap((r) => [r.Accept, r.Pay, r.Twist]),
      ...Object.values(rules.data.task_tables).flat().map((r) => r.Result),
      ...Object.values(rules.data.injury_tables).flat().map((r) => r.Result),
      ...rules.data.finds.map((r) => r.Find),
      ...rules.factions.flatMap((f) => f.ownTaskTable.map((r) => r.Result)),
    ];
    for (const t of texts) expect(() => readOutcomes(rules, t)).not.toThrow();
    // and most of them name something the app can act on
    const acted = texts.filter((t) => readOutcomes(rules, t).length > 0).length;
    expect(acted / texts.length).toBeGreaterThan(0.4);
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
