// The rules update of 2026-11-04: subfactions replace a rule of the player's choice, Row 7,
// Bodger belts, the Director's camera, bots never captured, debt, leads.
import { describe, expect, it } from 'vitest';
import { crewOf, otherRule, rules } from './helpers';
import { breakingStatus, newBattle, storyEventFor, storyKey } from '../src/engine/battle';
import { finishCreation, replaceableRules, ruleActive, slotLoad, typeCarries } from '../src/engine/crew';
import { activeEffects, rulesInForce } from '../src/engine/faction';
import { validators } from '../src/engine/validate';
import { migrateCrew } from '../src/store';
import type { Crew } from '../src/engine/model';

const F = rules.crew.factions;

describe('a subfaction replaces any one rule, the player\'s choice (12.1)', () => {
  it('rules the book marks as fixed are never offered', () => {
    for (const f of rules.factions) {
      const offered = replaceableRules(rules, f.name).map((r) => r.n);
      for (const r of f.rules) expect(offered.includes(r.n), `${f.name} rule ${r.n}`).toBe(!r.fixed);
    }
    expect(rules.factions.filter((f) => f.rules.some((r) => r.fixed)).length).toBe(3);
  });
  it('the replaced rule is gone from the rules in force and its effects; the others stay', () => {
    for (const f of rules.factions) for (const r of replaceableRules(rules, f.name)) {
      const c = crewOf(f.name, undefined, undefined, r.n);
      expect(ruleActive(rules, c, r.n)).toBe(false);
      const titles = rulesInForce(rules, c).map((x) => x.title);
      expect(titles.some((t) => t.startsWith(`${r.n}.`)), `${f.name} ${r.n}`).toBe(false);
      for (const o of f.rules.filter((x) => x.n !== r.n)) expect(titles.some((t) => t.startsWith(`${o.n}.`))).toBe(true);
      for (const e of activeEffects(rules, c)) expect(e.effect.rule, e.effect.id).not.toBe(r.n);
    }
  });
  it('a crew with a subfaction must say which rule it replaces', () => {
    const f = rules.factions[0].name;
    const c = { ...crewOf(f), replacedRule: null };
    expect(validators.faction({ rules, crew: c }).some((m) => m.level === 'error')).toBe(true);
    expect(validators.faction({ rules, crew: crewOf(f) }).filter((m) => m.level === 'error')).toEqual([]);
    const fixed = rules.factions.find((x) => x.rules.some((r) => r.fixed))!;
    const n = fixed.rules.find((r) => r.fixed)!.n;
    expect(validators.faction({ rules, crew: { ...crewOf(fixed.name), replacedRule: n } }).some((m) => m.level === 'error')).toBe(true);
  });
  it('credit, and the cheaper volunteers, depend on the rule being kept', () => {
    const led = Object.keys(F).find((n) => F[n].credit)!;
    const credit = F[led].credit!;
    expect(ruleActive(rules, crewOf(led, undefined, undefined, credit.rule), credit.rule)).toBe(false);
    expect(ruleActive(rules, crewOf(led, undefined, undefined, otherRule(led, credit.rule)), credit.rule)).toBe(true);
  });
});

describe('a breaking die that depends on the crew\'s parts (Pay or walk)', () => {
  it('+1 die at or above the mark, -1 below 0, nothing in between', () => {
    const fac = Object.keys(F).find((n) => F[n].effects?.some((e) => e.partsAtLeast !== undefined))!;
    const up = F[fac].effects!.find((e) => e.partsAtLeast !== undefined)!;
    const c0 = finishCreation(rules, crewOf(fac, undefined, undefined, otherRule(fac, up.rule)));
    const eff = (c: Crew) => activeEffects(rules, c, 'breaking').map((e) => ({ ...e.effect, title: e.title }));
    const dice = (parts: number) => { const c = { ...c0, phase: 'campaign' as const, parts }; return breakingStatus(rules, c, newBattle(rules, c), eff(c)).dice; };
    const base = dice(up.partsAtLeast! - 1);
    expect(dice(up.partsAtLeast!)).toBe(base + up.amount!);
    expect(dice(-1)).toBeLessThan(base);
  });
});

describe('Row 7: a story event table for each faction (14.5)', () => {
  it('row 7 is the crew\'s own faction table, and always fits', () => {
    for (const f of rules.factions) expect(storyKey(rules, { faction: f.name } as Crew, '7')).toBe(`Row 7: ${f.name}`);
    expect(storyKey(rules, { faction: rules.factions[0].name } as Crew, '1')).toMatch(/^Row 1:/);
    expect(Object.entries(rules.crew.afterBattle.storyRowHints.value).find(([, w]) => w === 'always')?.[0]).toBe('7');
  });
  it('each subfaction has its own events; another subfaction\'s event is rolled again', () => {
    for (const f of rules.factions) {
      const rows = rules.data.story_events[`Row 7: ${f.name}`];
      for (const s of f.subfactions) {
        const mine = { faction: f.name, subfaction: s.name } as Crew;
        const forUs = rows.filter((r) => !storyEventFor(rules, mine, r.Event));
        const other = rows.filter((r) => storyEventFor(rules, mine, r.Event));
        expect(other.length, `${f.name} / ${s.name}`).toBe(f.subfactions.length - 1);
        expect(forUs.length).toBe(rows.length - other.length);
      }
    }
  });
});

describe('gear and fighters', () => {
  it('the Director carries the camera: one Hand of their first set is always in use (12.7)', () => {
    const holly = Object.keys(F).find((n) => Object.values(F[n].typeGrants ?? {}).some((g) => g.carries))!;
    const c = finishCreation(rules, crewOf(holly));
    const [type, g] = Object.entries(F[holly].typeGrants!).find(([, x]) => x.carries)!;
    const dir = c.fighters.find((f) => f.type === type)!;
    expect(typeCarries(rules, c, dir)?.hands).toBe(g.carries!.hands);
    const empty = { ...c, items: c.items.filter((o) => o.fighterId !== dir.id) };
    expect(slotLoad(rules, empty, dir, g.carries!.set)).toBe(g.carries!.hands);
    const other = c.fighters.find((f) => f.type !== type)!;
    expect(slotLoad(rules, { ...c, items: [] }, other, 'set1')).toBe(0);
  });
  it('a bot is never captured or evacuated while down (5.8, 13.3)', () => {
    const notBot = rules.crew.battle.positions.value.filter((p) => p.notBot).map((p) => p.name);
    expect(rules.crew.battle.positions.value.filter((p) => p.captured).every((p) => p.notBot)).toBe(true);
    expect(notBot.length).toBeGreaterThan(0);
  });
  it('the Merciful and Oathkeepers tags exist, and the outcomes give them', () => {
    const tags = rules.tags.map((t) => t.name);
    const json = JSON.stringify(rules.outcomes);
    for (const t of ['Merciful', 'Oathkeepers']) { expect(tags).toContain(t); expect(json).toContain(`"tag":"${t}"`); }
  });
});

describe('saved crews from before the update', () => {
  it('the roster rumour note becomes the lead (14.8)', () => {
    const c = crewOf(rules.factions[0].name);
    const old = { ...c, notes: { ...(({ lead, ...rest }) => rest)(c.notes), rumour: 'They owe Jeminy' } } as unknown as Crew;
    expect(migrateCrew(old).notes.lead).toBe('They owe Jeminy');
    expect('rumour' in migrateCrew(old).notes).toBe(false);
    expect(migrateCrew(c)).toBe(c);
  });
});
