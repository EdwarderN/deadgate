import { describe, expect, it } from 'vitest';
import { buildRules, rawData, validateRaw } from '../src/data/rules';
import crewRulesJson from '../data/manual/crew-rules.json';
import { rules } from './helpers';
import { kitLines } from '../src/engine/crew';
import { newCrew, setFaction } from '../src/engine/crew';

describe('data files', () => {
  it('every generated file matches its schema', () => {
    expect(() => validateRaw(rawData)).not.toThrow();
  });
  it('crew-rules.json matches its schema and builds', () => {
    expect(() => buildRules(rawData, crewRulesJson)).not.toThrow();
  });
  it('a broken file fails loudly', () => {
    const bad = { ...rawData, species: [{ Species: 'X' }] } as unknown as typeof rawData;
    expect(() => validateRaw(bad)).toThrow(/species/);
    const badRules = { ...crewRulesJson, limits: { ...crewRulesJson.limits, maxFighters: { value: 'nine' } } };
    expect(() => buildRules(rawData, badRules)).toThrow(/crew-rules/);
  });
  it('every shop item is joined to its rules row', () => {
    expect(rules.meta.unlinkedShopItems).toEqual([]);
    for (const i of rules.shopItems) {
      expect(i.kind, i.name).toBeTruthy();
      expect(i.section, i.name).toMatch(/^\d+\.\d+$/);
    }
  });
  it('shows a rules version', () => {
    expect(rules.version).toMatch(/\d/);
  });
  it('every faction has its hand-kept rules, and back', () => {
    const book = rules.factions.map((f) => f.name).sort();
    expect(Object.keys(rules.crew.factions).sort()).toEqual(book);
  });
  it('price rules name a rule or subfaction of the book', () => {
    for (const f of rules.factions) {
      for (const pr of rules.factionRules(f.name)!.priceRules ?? []) {
        if (pr.rule) expect(f.rules.some((r) => r.n === pr.rule), `${f.name} ${pr.kind}`).toBe(true);
        if (pr.subfaction) expect(f.subfactions.some((s) => s.name === pr.subfaction)).toBe(true);
      }
    }
  });
  it('every starting kit item exists in the shop', () => {
    for (const f of rules.factions) {
      const c = setFaction(rules, newCrew(rules), f.name);
      for (const l of kitLines(rules, c)) if (l.itemId) expect(rules.item(l.itemId), l.label).toBeTruthy();
    }
  });
  it('types named in crew-rules exist in the book', () => {
    for (const f of rules.factions) {
      const fr = rules.factionRules(f.name)!;
      const names = f.types.map((t) => t.name);
      for (const t of [...Object.keys(fr.typeGrants ?? {}), ...Object.keys(fr.typeSpecies ?? {}), ...(fr.fixedRookies ?? []), ...(fr.captainType ? [fr.captainType] : [])]) expect(names, f.name).toContain(t);
    }
  });
  it('captain traits named in crew-rules exist', () => {
    for (const m of rules.crew.creation.oldStockSeller.modifiers) expect(rules.captainTraits.map((t) => t.name)).toContain(m.captainTrait);
  });
  it('reads recruit prices from the shop table', () => {
    expect(rules.recruitPrices.Human).toBe(rules.crew.creation.rookieBasePrice.value);
    for (const s of rules.crew.limits.playableSpecies.value) expect(rules.recruitPrices[s], s).toBeGreaterThan(0);
    for (const c of Object.keys(rules.chassis)) expect(rules.recruitPrices[c], c).toBeGreaterThan(0);
  });
  it('reads bot chassis Move and Hands', () => {
    expect(Object.keys(rules.chassis).length).toBeGreaterThan(0);
    for (const c of Object.values(rules.chassis)) { expect(c.move).toBeGreaterThan(0); expect(c.hands).toBeGreaterThan(0); }
  });
  it('splits the rite advance into one per rite', () => {
    const riteAdv = rules.advanceDefs.filter((d) => d.needs === rules.crew.experience.ritesAdvance.value);
    expect(riteAdv.length).toBe(rules.rites.length);
    expect(rules.advanceDefs.some((d) => d.name === rules.crew.experience.ritesAdvance.value)).toBe(true);
  });
  it('the advance lists are Common plus one per rating', () => {
    expect(rules.advanceLists.sort()).toEqual([rules.crew.experience.commonList.value, ...rules.crew.limits.ratingNames.value].sort());
  });
  it('the XP ladder matches the book and grows by one', () => {
    const t = rules.thresholds(8);
    const book = rules.data.xp_ladder.filter((r) => /^\d+$/.test(r['Total Experience'])).map((r) => +r['Total Experience']);
    expect(t.slice(0, book.length)).toEqual(book);
    expect(t[book.length] - t[book.length - 1]).toBe(rules.crew.experience.ladder.gapAfter.value);
    expect(t[book.length + 1] - t[book.length]).toBe(rules.crew.experience.ladder.gapAfter.value + 1);
  });
  it('injury effects and prosthetics name real injuries and items', () => {
    const inj = rules.injuries.map((i) => i.name);
    for (const [k, v] of Object.entries(rules.crew.gear.prosthetics.value)) {
      expect(inj).toContain(v);
      expect(rules.items.some((i) => i.key === k), k).toBe(true);
    }
    for (const k of Object.keys(rules.crew.gear.injuryEffects.value)) expect(inj).toContain(k);
  });
  it('gear keys named in crew-rules exist', () => {
    const g = rules.crew.gear;
    const keys = new Set(rules.items.map((i) => i.key));
    for (const k of [g.frameKeys.value.military, g.frameKeys.value.civilian, g.heavyArmourKey.value, ...Object.keys(g.moveModifiers.value), ...Object.keys(g.saveDice.value), ...g.restrictedItems.value.map((r) => r.key)]) expect(keys.has(k), k).toBe(true);
    for (const a of g.civilianFrameArmour.value) expect(keys.has(`${a.toLowerCase()} armour`)).toBe(true);
  });
  it('legends come with titles', () => {
    expect(rules.legends.length).toBeGreaterThan(0);
    for (const l of rules.legends) expect(l.title, l.name).toBeTruthy();
  });
  it('injuries, glitches and silly traits have titles', () => {
    for (const i of [...rules.injuries, ...rules.glitches, ...rules.silly]) expect(i.title, i.name).toBeTruthy();
  });
  it('battle and after-battle names in crew-rules exist in the book', () => {
    const lp = rules.crew.afterBattle.leaguePoints.value;
    for (const r of rules.data.league_points) {
      const label = r.What.replace(/\*\*(.+?)\*\*/g, '$1').replace(/:.*$/, '').replace(/\s*\(.*\)\s*$/, '').trim();
      expect(lp[label], label).toBeTruthy();
    }
    for (const n of Object.values(rules.crew.afterBattle.genericXp.value)) expect(rules.data.generic_xp.some((r) => r.Deed.includes(n)), n).toBe(true);
    for (const t of Object.values(rules.crew.afterBattle.injuryTables.value)) expect(rules.data.injury_tables[t], t).toBeTruthy();
    for (const t of Object.values(rules.crew.battle.sillyTables.value)) expect(rules.silly.some((s) => s.table === t), t).toBe(true);
    for (const s of rules.crew.battle.cancellingStates.value) expect(rules.data.states.some((x) => x.State.includes(s)), s).toBe(true);
    expect(rules.data.word_audiences.some((a) => a.Audience.includes(rules.crew.battle.boastAudience.value))).toBe(true);
    expect(rules.captainTraits.some((t) => t.name === rules.crew.battle.wordsPerSide.extraFrom.captainTrait)).toBe(true);
    expect(rules.tags.some((t) => t.name === rules.crew.battle.wordsPerSide.extraFrom.tag)).toBe(true);
    const ws = rules.crew.battle.wagerStakes;
    for (const t of [ws.noTakerTag, ws.alwaysTakerTag]) expect(rules.tags.some((x) => x.name === t), t).toBe(true);
    expect(rules.tags.some((t) => t.name === rules.crew.afterBattle.evacTag.value)).toBe(true);
    for (const t of rules.crew.afterBattle.ransomTags?.value ?? []) expect(rules.tags.some((x) => x.name === t), t).toBe(true);
    if (rules.crew.campaign.doctor) expect(rules.crew.campaign.statuses.value).toContain(rules.crew.campaign.doctor.value);
    for (const st of rules.crew.afterBattle.taskBlockedStatuses.value) expect(rules.crew.campaign.statuses.value).toContain(st);
    expect(Object.keys(rules.data.voices).length).toBeGreaterThan(0);
  });
});
