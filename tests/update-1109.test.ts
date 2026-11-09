// The rules update of 2026-11-09: Spend effects, losing a note, roster caps, tag dice,
// Butchers' two rolls, Merciful's contact, "Paste", rival XP, the carried downed fighter.
import { describe, expect, it } from 'vitest';
import { crewOf, rules } from './helpers';
import { battleXp, injuryTableFor, newBattle, positions, storyRolls, tagDice, titleReminders } from '../src/engine/battle';
import { finishCreation, hireExtra, rechargeCost, sellValue, shopPrice, useSpend, itemPrice, advancesEarned } from '../src/engine/crew';
import { resolveEffects } from '../src/engine/effects';
import { applyChanges } from '../src/engine/outcomes';
import type { Crew } from '../src/engine/model';

const base = (): Crew => ({ ...finishCreation(rules, crewOf(rules.factions[0].name)), phase: 'campaign', parts: 40 });
const withNotes = (c: Crew, n: Partial<Crew['notes']>): Crew => ({ ...c, notes: { ...c.notes, ...n } });
const run = (c: Crew, effs: Parameters<typeof resolveEffects>[2], st = {}) => resolveEffects(rules, c, effs, { note: 't' }, st, 'x');

describe('Spend effects last one break (14.6)', () => {
  it('a story event records them, and prices follow until they are used', () => {
    let c = base();
    const r = run(c, [{ spend: { kind: 'rechargeDouble' } }, { spend: { kind: 'purchase', amount: 3 } }, { spend: { kind: 'hire' } }, { spend: { kind: 'sale' } }]);
    c = applyChanges(rules, c, r.changes).crew;
    expect(c.spendEffects?.length).toBe(4);
    const se = rules.crew.campaign.spendEffects!.value;
    expect(rechargeCost(rules, 2, c)).toBe(2 * rules.crew.campaign.rechargePerEnergy.value * se.rechargeMultiplier);
    const it = rules.shopItems.find((i) => i.source === 'copy' && (i.price ?? 0) > 3)!;
    expect(shopPrice(rules, c, it)).toBe(itemPrice(rules, c, it) + 3);
    expect(shopPrice(rules, useSpend(c, 'purchase'), it)).toBe(itemPrice(rules, c, it));
    expect(hireExtra(rules, c)).toBe(se.hireExtra);
    expect(hireExtra(rules, useSpend(c, 'hire'))).toBe(0);
    const o = { uid: 'u', itemId: it.id, fighterId: null, slot: 'stash' as const };
    expect(sellValue(rules, c, o)).toBe(it.price);
    expect(sellValue(rules, useSpend(c, 'sale'), o)).toBe(Math.floor(it.price! * rules.crew.campaign.sellFraction.value));
  });
  it('a cheaper first purchase never goes below 0', () => {
    const c = { ...base(), spendEffects: [{ kind: 'purchase' as const, amount: -99 }] };
    expect(shopPrice(rules, c, rules.shopItems[0])).toBe(0);
  });
});

describe('roster notes (14.8)', () => {
  const fb = rules.crew.campaign.loseNoteFallback!.value;
  it('losing a contact asks which; with none the crew loses parts instead', () => {
    const none = run(base(), [{ loseContact: true }]);
    expect(none.changes).toEqual([{ kind: 'parts', amount: -fb, note: 't: no contact to lose' }]);
    const c = withNotes(base(), { contacts: [{ name: rules.contacts[0].name, used: false }] });
    expect(run(c, [{ loseContact: true }]).missing.length).toBe(1);
    const r = run(c, [{ loseContact: true }], { 'x.0': rules.contacts[0].name });
    expect(applyChanges(rules, c, r.changes).crew.notes.contacts).toEqual([]);
  });
  it('losing the lead, or parts when there is none', () => {
    expect(run(withNotes(base(), { lead: 'x' }), [{ loseLead: true }]).changes).toEqual([{ kind: 'lead', text: '' }]);
    expect(run(base(), [{ loseLead: true }]).changes[0]).toMatchObject({ kind: 'parts', amount: -fb });
  });
  it('a crew holding a lead gains no second; at most three rivals', () => {
    const c = withNotes(base(), { lead: 'old' });
    expect(applyChanges(rules, c, [{ kind: 'lead', text: 'new' }]).crew.notes.lead).toBe('old');
    const max = rules.crew.limits.maxRivals!.value;
    const many = withNotes(base(), { rivals: ['a', 'b', 'c'].slice(0, max) });
    expect(applyChanges(rules, many, [{ kind: 'rival', value: 'd' }]).crew.notes.rivals).toEqual([...['a', 'b', 'c'].slice(1, max), 'd']);
  });
});

describe('tags between battles (14.10)', () => {
  it('Ran and Reliable add dice to Twist tests; the task tags to the first test of their task', () => {
    for (const t of rules.crew.afterBattle.tagDice!.value) {
      const c = withNotes(base(), { tags: [t.tag] });
      const d = t.on === 'twist' ? tagDice(rules, c, { twist: true }) : tagDice(rules, c, { task: t.task! });
      expect(d.dice, t.tag).toBe(t.dice);
      expect(rules.tags.some((x) => x.name === t.tag)).toBe(true);
    }
  });
  it('Butchers roll twice on row 5', () => {
    const r = rules.crew.afterBattle.tagStoryRolls!.value[0];
    expect(storyRolls(rules, base(), r.row)).toBe(1);
    expect(storyRolls(rules, withNotes(base(), { tags: [r.tag] }), r.row)).toBe(r.rolls);
  });
  it("Merciful, when gained, gives a contact of the crew's choice (not when it cancels)", () => {
    const [tag] = Object.keys(rules.crew.afterBattle.tagGain!.value);
    const r = run(base(), [{ tag }]);
    expect(r.missing).toContain('choose a contact');
    const r2 = run(base(), [{ tag }], { 'x.0.gain.0': rules.contacts[0].name });
    expect(r2.changes.map((x) => x.kind)).toEqual(['tag', 'contact']);
    const opp = rules.data.tag_opposites.flat().find((_, i, a) => a[i ^ 1] === tag)!;
    expect(run(withNotes(base(), { tags: [opp] }), [{ tag }]).missing).toEqual([]);
  });
});

describe('fighters', () => {
  it('"Paste": the next time they would be Sore, they are not, once', () => {
    let c = base();
    const f = c.fighters[0];
    const sore = rules.crew.campaign.statuses.value.find((s) => /sore/i.test(s))!;
    c = applyChanges(rules, c, [{ kind: 'ward', fid: f.id, value: sore }]).crew;
    c = applyChanges(rules, c, [{ kind: 'status', fid: f.id, value: sore }]).crew;
    expect(c.fighters[0].status).not.toBe(sore);
    c = applyChanges(rules, c, [{ kind: 'status', fid: f.id, value: sore }]).crew;
    expect(c.fighters[0].status).toBe(sore);
  });
  it('an XP loss stops at the last advance threshold', () => {
    let c = base();
    const t1 = rules.thresholds(1)[0];
    c = { ...c, fighters: c.fighters.map((f, i) => (i === 0 ? { ...f, xp: t1 + 1 } : f)) };
    c = applyChanges(rules, c, [{ kind: 'xp', fid: c.fighters[0].id, amount: -5, note: '' }]).crew;
    expect(c.fighters[0].xp).toBe(t1);
    expect(advancesEarned(rules, c.fighters[0].xp)).toBe(1);
  });
  it('putting down a rival pays once a battle; a carried downed fighter rolls the gentle table', () => {
    const c = base();
    const b = newBattle(rules, c);
    const id = c.fighters[0].id;
    b.fighters[id] = { ...b.fighters[id], putDowns: 2, rivalDown: true };
    expect(battleXp(rules, c, b, id).find((l) => l.label === 'Put down a rival')?.xp).toBe(rules.crew.afterBattle.rivalXp!.value);
    const carried = positions(rules).find((p) => p.injury === 'gentle' && p.down && !p.cameHome && !p.captured)!;
    expect(carried.notBot).toBe(true);
    b.fighters[id] = { ...b.fighters[id], position: carried.name };
    expect(injuryTableFor(rules, b, id)?.table).toBe(rules.crew.afterBattle.injuryTables.value.gentle);
  });
});

describe("designer's answers 36 and 37, and titles with a rule", () => {
  it('a fourth contact replaces the one the player chooses', () => {
    const names = rules.contacts.map((c) => c.name);
    const max = rules.crew.limits.maxContacts.value;
    const c = withNotes(base(), { contacts: names.slice(0, max).map((name) => ({ name, used: false })) });
    const fresh = names[max];
    const r = run(c, [{ contact: fresh }]);
    expect(r.missing).toEqual(['choose the contact it replaces']);
    const r2 = run(c, [{ contact: fresh }], { 'x.0.replace': names[1] });
    const after = applyChanges(rules, c, r2.changes).crew.notes.contacts.map((x) => x.name);
    expect(after).toEqual([...names.slice(0, max).filter((n) => n !== names[1]), fresh]);
  });
  it('"Fighter of the Year" is a title in the Twist success of Row 6, event 4', () => {
    const e = rules.outcomes.storyEvents['Row 6: Made a legend']['4'].twist!.success;
    expect(e.some((x) => x.title === 'Fighter of the Year')).toBe(true);
  });
  it('titles with a rule show in battle: a named one, and a prefixed one while a crew-mate holds the plain title', () => {
    const named = rules.data.title_rules.find((t) => !t.prefixed)!;
    let c = base();
    c = { ...c, fighters: c.fighters.map((f, i) => (i === 0 ? { ...f, titles: [named.title] } : i === 1 ? { ...f, title: 'the Hammer' } : i === 2 ? { ...f, title: 'Little Hammer' } : f)) };
    expect(titleReminders(rules, c, c.fighters[0]).map((t) => t.title)).toEqual([named.title]);
    const pre = titleReminders(rules, c, c.fighters[2]);
    expect(pre[0]).toMatchObject({ title: 'Little Hammer', plainHolder: { id: c.fighters[1].id } });
    expect(titleReminders(rules, c, c.fighters[1])).toEqual([]);
  });
});
