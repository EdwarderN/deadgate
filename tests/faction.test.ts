import { describe, expect, it } from 'vitest';
import { crewOf, patchFighter, rules } from './helpers';
import { battleXp, injuryTableFor, newBattle, positions } from '../src/engine/battle';
import { finishCreation, setFighterType } from '../src/engine/crew';
import {
  activeEffects, canTakeTitle, effectActive, factionAfterBattle, factionWordBonus, putDownXpTarget, researchEligible, rulesInForce, taskPay,
  type FactionAnswers,
} from '../src/engine/faction';
import { validators } from '../src/engine/validate';
import type { Battle, Crew } from '../src/engine/model';

const F = rules.crew.factions;
const none: FactionAnswers = { asks: {}, stars: {}, researchDone: false, researchWho: null };
const effect = (faction: string, kind: string) => F[faction].effects!.find((e) => e.kind === kind)!;
const factionWith = (kind: string, pred: (e: NonNullable<typeof F[string]['effects']>[number]) => boolean = () => true) =>
  Object.keys(F).find((n) => F[n].effects?.some((e) => e.kind === kind && pred(e)))!;
/** A crew whose subfaction keeps the effect in force (not one that replaces its rule). */
function crewKeeping(faction: string, e: { rule?: number; subfaction?: string }): Crew {
  const fac = rules.faction(faction)!;
  const sub = e.subfaction ?? fac.subfactions.find((s) => s.replaces !== e.rule)!.name;
  return finishCreation(rules, crewOf(faction, sub));
}
function playing(crew: Crew, edit: (b: Battle) => Battle = (b) => b): Battle {
  return edit({ ...newBattle(rules, crew), phase: 'ended' });
}
const setF = (b: Battle, id: string, p: object): Battle => ({ ...b, fighters: { ...b.fighters, [id]: { ...b.fighters[id], ...p } } });

describe('every faction effect names real rules, subfactions and types', () => {
  it('rule numbers, subfactions, types and task names exist in the book', () => {
    const tasks = rules.data.tasks.map((t) => t.Task.replace(/\*\*/g, ''));
    for (const f of rules.factions) {
      const fr = F[f.name];
      for (const e of fr.effects ?? []) {
        if (e.rule) expect(f.rules.some((r) => r.n === e.rule), `${f.name} ${e.id}`).toBe(true);
        if (e.subfaction) expect(f.subfactions.some((s) => s.name === e.subfaction), `${f.name} ${e.id}`).toBe(true);
        if (e.type) expect(f.types.some((t) => t.name === e.type), `${f.name} ${e.id}`).toBe(true);
        for (const t of e.eligibleTypes ?? []) expect(f.types.some((x) => x.name === t), `${e.id} ${t}`).toBe(true);
      }
      for (const m of fr.taskPay ?? []) expect(tasks).toContain(m.task);
      for (const [t, r] of Object.entries(fr.typeRules ?? {})) {
        expect(f.types.some((x) => x.name === t), t).toBe(true);
        if (r.putDownXpTo) expect(f.types.some((x) => x.name === r.putDownXpTo)).toBe(true);
      }
      if (fr.wordKind) expect(rules.data.word_audiences.some((a) => a.Audience.includes(fr.wordKind!.value)), f.name).toBe(true);
    }
    for (const m of rules.crew.taskPay.value) {
      expect(tasks).toContain(m.task);
      if (m.captainTrait) expect(rules.captainTraits.some((t) => t.name === m.captainTrait)).toBe(true);
      if (m.tag) expect(rules.tags.some((t) => t.name === m.tag)).toBe(true);
    }
  });
  it('every faction with Words has a Word kind, and every subfaction of every faction is in force for itself', () => {
    for (const f of rules.factions) {
      if (!F[f.name].noWords) expect(F[f.name].wordKind, f.name).toBeTruthy();
      for (const s of f.subfactions) {
        const c = crewOf(f.name, s.name);
        expect(rulesInForce(rules, c).some((r) => r.title.startsWith(s.name))).toBe(true);
        expect(rulesInForce(rules, c).some((r) => r.title.startsWith(`${s.replaces}.`))).toBe(false);
      }
    }
  });
  it('a numbered-rule effect turns off when the subfaction replaces it', () => {
    for (const [name, fr] of Object.entries(F)) for (const e of fr.effects ?? []) {
      if (!e.rule) continue;
      const replacer = rules.faction(name)!.subfactions.find((s) => s.replaces === e.rule);
      if (replacer) expect(effectActive(rules, crewOf(name, replacer.name), e), e.id).toBe(false);
    }
  });
});

describe('faction pay after a battle (chapter 12)', () => {
  it('parts per enemy put down, capped at the faction pay cap', () => {
    const fac = factionWith('partsPer', (e) => e.per === 'putDowns');
    const e = F[fac].effects!.find((x) => x.per === 'putDowns')!;
    const c = crewKeeping(fac, e);
    const [a, b2] = c.fighters;
    const b = setF(setF(playing(c), a.id, { putDowns: 2 }), b2.id, { putDowns: 2 });
    const r = factionAfterBattle(rules, c, b, none);
    const total = r.parts.reduce((s, p) => s + p.amount, 0);
    expect(total).toBe(Math.min(4 * e.amount!, rules.crew.factionPayCap.value));
    expect(r.capped).toBe(Math.max(0, 4 * e.amount! - rules.crew.factionPayCap.value));
  });
  it('parts per crushing put-down', () => {
    const fac = factionWith('partsPer', (e) => e.per === 'crushingPutDowns');
    const e = F[fac].effects!.find((x) => x.per === 'crushingPutDowns')!;
    const c = crewKeeping(fac, e);
    const b = setF(playing(c), c.fighters[0].id, { putDowns: 2, crushing: 1 });
    expect(factionAfterBattle(rules, c, b, none).parts[0].amount).toBe(e.amount);
  });
  it('a yes/no bounty pays only when answered yes', () => {
    const fac = factionWith('partsIf', (e) => !e.subfaction);
    const e = F[fac].effects!.find((x) => x.kind === 'partsIf' && !x.subfaction)!;
    const c = crewKeeping(fac, e);
    expect(factionAfterBattle(rules, c, playing(c), none).parts).toEqual([]);
    expect(factionAfterBattle(rules, c, playing(c), { ...none, asks: { [e.id]: true } }).parts[0].amount).toBe(e.amount);
  });
  it('XP for each fighter who took part when the crew carried something off', () => {
    const fac = factionWith('xpEach', (e) => !!e.ask);
    const e = F[fac].effects!.find((x) => x.kind === 'xpEach' && x.ask)!;
    const c = crewKeeping(fac, e);
    const b = setF(playing(c), c.fighters[3].id, { inBattle: false });
    expect(factionAfterBattle(rules, c, b, none).xp).toEqual([]);
    expect(factionAfterBattle(rules, c, b, { ...none, asks: { [e.id]: true } }).xp.length).toBe(3);
  });
  it('XP for fighters standing and Shook at the end', () => {
    const fac = factionWith('xpEach', (e) => !!e.state);
    const e = F[fac].effects!.find((x) => x.state)!;
    const c = crewKeeping(fac, e);
    const down = positions(rules).find((p) => p.down)!.name;
    let b = setF(playing(c), c.fighters[0].id, { states: [e.state!] });
    b = setF(b, c.fighters[1].id, { states: [e.state!], position: down });
    const xp = factionAfterBattle(rules, c, b, none).xp;
    expect(xp.map((x) => x.fid)).toEqual([c.fighters[0].id]);
  });
  it('XP for a world not fought on this season', () => {
    const fac = factionWith('xpEach', (e) => e.condition === 'newWorld');
    const e = F[fac].effects!.find((x) => x.condition === 'newWorld')!;
    let c = crewKeeping(fac, e);
    const b = { ...playing(c), world: 'Encore' };
    expect(factionAfterBattle(rules, c, b, none).xp.length).toBe(4);
    c = { ...c, notes: { ...c.notes, season: [{ id: 's', battle: '1', world: 'encore', opponent: '', winCond: '', heldField: '', story: '', points: 0 }] } };
    expect(factionAfterBattle(rules, c, b, none).xp.length).toBe(0);
  });
  it('stars from the opponent: top gives XP, bottom costs a fee', () => {
    const fac = factionWith('rating');
    const e = effect(fac, 'rating');
    const c = crewKeeping(fac, e);
    const [a, b2] = c.fighters;
    const r = factionAfterBattle(rules, c, playing(c), { ...none, stars: { [a.id]: e.high!.value, [b2.id]: e.low!.value } });
    expect(r.xp).toEqual([expect.objectContaining({ fid: a.id, xp: e.high!.xp })]);
    expect(r.parts[0].amount).toBe(e.low!.parts);
  });
  it('research: +XP to one eligible fighter who took part', () => {
    const fac = factionWith('research');
    const e = effect(fac, 'research');
    let c = crewKeeping(fac, e);
    c = { ...c, fighters: c.fighters.map((f, i) => (i === 0 ? setFighterType(rules, c, f, e.eligibleTypes![0]) : f)) };
    const b = playing(c);
    expect(researchEligible(rules, c, b).some((f) => f.id === c.fighters[0].id)).toBe(true);
    const r = factionAfterBattle(rules, c, b, { ...none, researchDone: true, researchWho: c.fighters[0].id });
    expect(r.xp).toEqual([expect.objectContaining({ fid: c.fighters[0].id, xp: e.amount })]);
  });
  it("the faction's kind of Word gives +1 XP to the first fulfilled one", () => {
    const fac = Object.keys(F).find((n) => F[n].wordKind)!;
    const c = crewKeeping(fac, {});
    const deed = rules.deeds[0].id;
    const b = setF(setF(playing(c), c.fighters[1].id, { word: { deed, audience: F[fac].wordKind!.value, result: 'fulfilled' } }), c.fighters[2].id, { word: { deed, audience: F[fac].wordKind!.value, result: 'fulfilled' } });
    expect(factionWordBonus(rules, c, b)?.fid).toBe(c.fighters[1].id);
    expect(factionWordBonus(rules, c, playing(c))).toBeNull();
  });
});

describe('faction tasks and types', () => {
  const task = (fac: string, pred: (m: NonNullable<typeof F[string]['taskPay']>[number]) => boolean) => F[fac].taskPay!.find(pred)!;
  it('a faction rule adds to a task pay; a subfaction can replace it with XP', () => {
    const fac = Object.keys(F).find((n) => F[n].taskPay)!;
    const add = task(fac, (m) => !!m.rule && !!m.parts);
    const c = crewKeeping(fac, add);
    expect(taskPay(rules, c, add.task, true, 10).parts).toBe(10 + add.parts!);
    expect(taskPay(rules, c, add.task, false, null).parts).toBeNull();
    const rep = task(fac, (m) => m.setParts !== undefined);
    const c2 = crewOf(fac, rep.subfaction);
    expect(taskPay(rules, c2, rep.task, true, 10)).toMatchObject({ parts: rep.setParts, xp: rep.xpSuccess });
    expect(taskPay(rules, c2, rep.task, false, null)).toMatchObject({ xp: rep.xpFailure });
  });
  it('captain traits and tags change task pay', () => {
    const m = rules.crew.taskPay.value.find((x) => x.tag && x.parts! < 0)!;
    const fac = Object.keys(F).find((n) => !F[n].taskPay)!;
    const c = crewOf(fac);
    const tagged = { ...c, notes: { ...c.notes, tags: [m.tag!] } };
    expect(taskPay(rules, tagged, m.task, true, 10).parts).toBe(10 + m.parts!);
  });
  it('a type that always rolls the gentle table when left behind', () => {
    const fac = Object.keys(F).find((n) => Object.values(F[n].typeRules ?? {}).some((r) => r.injuryTable))!;
    const [type] = Object.entries(F[fac].typeRules!).find(([, r]) => r.injuryTable)!;
    let c = finishCreation(rules, crewOf(fac));
    c = { ...c, fighters: c.fighters.map((f, i) => (i === 0 ? setFighterType(rules, c, f, type) : f)) };
    const down = positions(rules).find((p) => p.injury === 'heldField')!.name;
    const b = setF(playing(c), c.fighters[0].id, { position: down });
    expect(injuryTableFor(rules, b, c.fighters[0].id, c)?.table).toBe(rules.crew.afterBattle.injuryTables.value.gentle);
    expect(injuryTableFor(rules, b, c.fighters[0].id)?.table).toBe(rules.crew.afterBattle.injuryTables.value.harsh);
  });
  it('a type that gives its put-down XP away, and can never take a title', () => {
    const fac = Object.keys(F).find((n) => Object.values(F[n].typeRules ?? {}).some((r) => r.putDownXpTo))!;
    const [type] = Object.entries(F[fac].typeRules!).find(([, r]) => r.putDownXpTo)!;
    const c = finishCreation(rules, crewOf(fac));
    const sd = c.fighters.find((f) => f.type === type)!;
    expect(putDownXpTarget(rules, c, sd)).toBe(F[fac].typeRules![type].putDownXpTo);
    const b = setF(playing(c), sd.id, { putDowns: 1 });
    expect(battleXp(rules, c, b, sd.id).some((l) => l.label.startsWith(rules.crew.afterBattle.genericXp.value.putDown))).toBe(false);
    expect(canTakeTitle(rules, c, sd)).toBe(false);
    const titled = patchFighter(c, c.fighters.indexOf(sd), { title: 'the Hammer' });
    expect(validators.typeRules({ rules, crew: titled }).length).toBe(1);
  });
  it('battle-time reminders show where they belong', () => {
    for (const when of ['setup', 'roundStart', 'pod', 'putDown', 'voice', 'voiceGood', 'captive', 'break', 'legend'] as const) {
      const fac = Object.keys(F).find((n) => F[n].effects?.some((e) => e.when === when));
      expect(fac, when).toBeTruthy();
      const e = F[fac!].effects!.find((x) => x.when === when)!;
      const shown = activeEffects(rules, crewKeeping(fac!, e), when);
      expect(shown.some((x) => x.effect.id === e.id && x.text.length > 0), e.id).toBe(true);
    }
  });
});
