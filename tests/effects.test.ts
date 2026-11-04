import { describe, expect, it } from 'vitest';
import { crewOf, otherRule, patchFighter, rules } from './helpers';
import { resolveEffects, type EffCtx } from '../src/engine/effects';
import { applyChanges } from '../src/engine/outcomes';
import { finishCreation } from '../src/engine/crew';
import type { Crew } from '../src/engine/model';

const O = rules.outcomes;
const crew = (): Crew => finishCreation(rules, crewOf(Object.keys(rules.crew.factions)[0]));
const kinds = (r: { changes: { kind: string }[] }) => r.changes.map((c) => c.kind);
const story = (row: number, d6: number) => O.storyEvents[Object.keys(O.storyEvents).find((k) => k.startsWith(`Row ${row}:`))!][String(d6)];

describe('resolving table effects', () => {
  it('a Pay answer costs parts and gives a tag, with nothing to decide', () => {
    const c = crew();
    const r = resolveEffects(rules, c, story(2, 4).pay!, { note: 'test' }, {}, 's');
    expect(r.missing).toEqual([]);
    expect(r.changes).toEqual([{ kind: 'parts', amount: -3, note: 'test' }]);
    expect(applyChanges(rules, c, r.changes).crew.parts).toBe(c.parts - 3);
  });
  it('a Pay answer that is not parts: a fighter wears the badge, and the crew gains a tag', () => {
    const c = crew();
    const e = story(1, 1).pay!;
    expect(resolveEffects(rules, c, e, { note: 'test' }, {}, 's').missing).toEqual(['choose a fighter']);
    const r = resolveEffects(rules, c, e, { note: 'test' }, { 's.who:choose': c.fighters[1].id }, 's');
    expect(r.changes).toEqual([{ kind: 'nextBattle', fid: c.fighters[1].id, value: 'Announced' }, { kind: 'tag', value: 'Reliable' }]);
    const after = applyChanges(rules, c, r.changes).crew;
    expect(after.parts).toBe(c.parts);
    expect(after.notes.tags).toContain('Reliable');
  });
  it('losses stop at 0; only a crew with credit pays a running cost into debt (14.2)', () => {
    const c = { ...crew(), parts: 2 };
    expect(applyChanges(rules, c, [{ kind: 'parts', amount: -5, note: '' }]).crew.parts).toBe(0);
    expect(applyChanges(rules, c, [{ kind: 'parts', amount: -5, note: '', floor: 'credit' }]).crew.parts).toBe(0);
    expect(applyChanges(rules, c, [{ kind: 'parts', amount: -5, note: '', floor: 'none' }]).crew.parts).toBe(-3);
    const led = Object.keys(rules.crew.factions).find((n) => rules.crew.factions[n].credit)!;
    const l = { ...crewOf(led, undefined, undefined, otherRule(led, rules.crew.factions[led].credit!.rule)), phase: 'campaign' as const, parts: 2 };
    expect(applyChanges(rules, l, [{ kind: 'parts', amount: -5, note: '', floor: 'credit' }]).crew.parts).toBe(-3);
    expect(applyChanges(rules, l, [{ kind: 'parts', amount: -50, note: '', floor: 'credit' }]).crew.parts).toBe(rules.crew.factions[led].credit!.value);
  });
  it('a crossed-off contact is a choice among the crew\'s contacts, and is removed', () => {
    const c = crew();
    expect(resolveEffects(rules, c, [{ crossContact: true }], { note: '' }, {}, 'x').missing).toEqual(['a contact to cross off']);
    const withC = { ...c, notes: { ...c.notes, contacts: [{ name: rules.contacts[0].name, used: false }] } };
    const r = resolveEffects(rules, withC, [{ crossContact: true }], { note: '' }, { 'x.0': rules.contacts[0].name }, 'x');
    expect(applyChanges(rules, withC, r.changes).crew.notes.contacts).toEqual([]);
  });
  it('a choice waits for the player, then gives the chosen option', () => {
    const c = crew();
    const e = O.taskTables['Scavenge']['12'];
    expect(resolveEffects(rules, c, e, { note: '' }, {}, 't').missing).toEqual(['make the choice']);
    expect(resolveEffects(rules, c, e, { note: '' }, { 't.0': 0 }, 't').changes).toEqual([{ kind: 'parts', amount: 15, note: '' }]);
    expect(kinds(resolveEffects(rules, c, e, { note: '' }, { 't.0': 1 }, 't'))).toEqual(['addItem']);
  });
  it('"one fighter" asks which, once per list', () => {
    const c = crew();
    const r = resolveEffects(rules, c, story(5, 4).twist!.success, { note: '' }, {}, 'x');
    expect(r.nodes.filter((n) => n.kind === 'select').length).toBe(1);
    expect(r.missing.length).toBeGreaterThan(0);
    const r2 = resolveEffects(rules, c, story(5, 4).twist!.success, { note: '' }, { 'x.who:choose': c.fighters[1].id }, 'x');
    expect(r2.missing).toEqual([]);
    expect(r2.changes.map((x) => ('fid' in x ? x.fid : ''))).toEqual([c.fighters[1].id, c.fighters[1].id]);
  });
  it('the task fighter is "self"; the newest fighter is found by Experience', () => {
    let c = crew();
    const ctx: EffCtx = { self: c.fighters[2].id, note: '' };
    const r = resolveEffects(rules, c, O.taskTables['Train']['7'], ctx, {}, 't');
    expect(r.changes).toEqual([{ kind: 'nextBattle', fid: c.fighters[2].id, value: 'Hyped' }]);
    c = { ...c, fighters: c.fighters.map((f, i) => ({ ...f, xp: i === 3 ? 0 : 5 })) };
    const s = resolveEffects(rules, c, story(2, 4).accept, { note: '' }, {}, 's');
    expect(s.changes).toEqual([{ kind: 'silly', fid: c.fighters[3].id, value: 'Jittery' }]);
  });
  it('finds roll nested effects; two finds keep one', () => {
    const c = crew();
    const e = O.taskTables['Hunt leads']['10'];
    expect(resolveEffects(rules, c, e, { note: '' }, { 't.0': [1, 3] }, 't').missing).toContain('roll on the finds table');
    const r = resolveEffects(rules, c, e, { note: '' }, { 't.0': [1, 3], 't.0.c': 0 }, 't');
    expect(r.changes).toEqual([{ kind: 'parts', amount: 4, note: '' }]);
  });
  it('a debt clause pays more when the crew is in debt', () => {
    const c = crew();
    const e = O.ownTasks['Ledgerhands'].table['3'];
    expect(resolveEffects(rules, c, e, { note: '', self: c.fighters[0].id }, {}, 't').changes).toEqual([{ kind: 'xp', fid: c.fighters[0].id, amount: 1, note: '' }]);
    expect(resolveEffects(rules, { ...c, parts: -4 }, e, { note: '' }, {}, 't').changes).toEqual([{ kind: 'parts', amount: 5, note: '' }]);
  });
  it('a lasting injury roll skips injuries the fighter has; three injuries means Laid up', () => {
    let c = crew();
    const f = c.fighters[0];
    const heavy = rules.injuries.filter((i) => i.table === 'Heavy');
    const row = O.injuryTables['The harsh table']['46, 51-56, 61-63'];
    c = patchFighter(c, 0, { injuries: [heavy[0].name] });
    const ctx: EffCtx = { self: f.id, note: '', injuryTable: 'The harsh table' };
    expect(resolveEffects(rules, c, row, ctx, { 'i.0': [1] }, 'i').missing).toEqual(['roll the lasting injury']);
    expect(resolveEffects(rules, c, row, ctx, { 'i.0': [1, 2] }, 'i').changes).toEqual([{ kind: 'injury', fid: f.id, value: heavy[1].name, title: heavy[1].title }]);
    c = patchFighter(c, 0, { injuries: heavy.slice(0, 3).map((x) => x.name) });
    expect(kinds(resolveEffects(rules, c, row, ctx, {}, 'i'))).toEqual(['status']);
  });
  it('the second opinion rolls twice more and uses the chosen row', () => {
    const c = crew();
    const ctx: EffCtx = { self: c.fighters[0].id, note: '', injuryTable: 'The gentle table' };
    const e = O.injuryTables['The gentle table']['33'];
    const r = resolveEffects(rules, c, e, ctx, { 'i.0': [21, 24], 'i.0.c': 1 }, 'i');
    expect(r.changes).toEqual([{ kind: 'status', fid: c.fighters[0].id, value: 'Sore' }]);
  });
  it('recruit offers, relic leads and found sellers carry into the Spend step', () => {
    const c = crew();
    const r = resolveEffects(rules, c, [...O.finds['4'], ...O.taskTables['Hunt leads']['7']], { note: '' }, {}, 'x');
    const after = applyChanges(rules, c, r.changes).crew;
    expect(after.relicLead).toEqual({ noRoll: true });
    expect(after.hireOffers?.[0].discount).toBe(5);
  });
  it('every row in outcomes.json resolves without error, with nothing chosen', () => {
    const c = crew();
    const ctx: EffCtx = { self: c.fighters[0].id, patient: c.fighters[1].id, teacher: c.fighters[2].id, note: '' };
    const lists = [
      ...Object.values(O.storyEvents).flatMap((t) => Object.values(t).flatMap((r) => [r.accept, r.pay ?? [], r.twist?.success ?? [], r.twist?.failure ?? []])),
      ...Object.entries(O.injuryTables).flatMap(([t, rows]) => Object.values(rows).map((r) => ({ r, t }))).map((x) => x.r),
      ...Object.values(O.taskTables).flatMap((t) => Object.values(t)), ...Object.values(O.finds), ...Object.values(O.dropTable),
      ...Object.values(O.ownTasks).flatMap((t) => [t.success, t.failure, ...Object.values(t.table)]), ...Object.values(O.taskBase).flatMap((t) => [t.success, t.failure]),
    ];
    for (const l of lists) expect(() => resolveEffects(rules, c, l, { ...ctx, injuryTable: 'The gentle table' }, {}, 'p')).not.toThrow();
  });
});
