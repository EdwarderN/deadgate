import { describe, expect, it } from 'vitest';
import { crewOf, patchFighter, rules } from './helpers';
import {
  addCondition, bandLower, battleXp, botWord, conditionLabel, conditionsFor, endActivation, injuryActions, injuryResult, injuryTableFor,
  leaguePoints, legendFor, newBattle, nextRound, partsIn, positions, roundEnd, sellerState, shotSeverity, sillyTableFor, startAfterBattle,
  statesEndingOnActivation, statusForWord, taskBlocked, taskDefs, toggleState, totalLeaguePoints, wordXp, wordsAllowed,
} from '../src/engine/battle';
import { cellCovers, isD66, lookup, rollPool, severityOfMargin } from '../src/engine/dice';
import { finishCreation, needsSeller, setSellerResult, sellerTarget } from '../src/engine/crew';
import type { Battle, Crew } from '../src/engine/model';
import { plain } from '../src/data/rules';

const F = rules.crew.factions;
const plainFaction = Object.keys(F).find((n) => !F[n].types && !F[n].priceRules && !F[n].credit)!;
const CG = Object.keys(F).find((n) => F[n].specials.bots)!;
const BIG_MOUTH = rules.crew.battle.wordsPerSide.extraFrom.captainTrait;
const pos = (pred: (p: ReturnType<typeof positions>[number]) => boolean) => positions(rules).find(pred)!.name;

function battleCrew(): { crew: Crew; b: Battle } {
  const crew = finishCreation(rules, crewOf(plainFaction));
  return { crew, b: { ...newBattle(rules, crew), phase: 'playing' } };
}

describe('dice and tables (chapter 3)', () => {
  it('reads table cells: single values, ranges and lists', () => {
    expect(cellCovers('11-16', 14)).toBe(true);
    expect(cellCovers('24-26, 31-32', 31)).toBe(true);
    expect(cellCovers('24-26, 31-32', 27)).toBe(false);
    expect(cellCovers('6', 6)).toBe(true);
  });
  it('every d66 result on both injury tables is covered exactly once', () => {
    for (const [name, rows] of Object.entries(rules.data.injury_tables)) {
      for (let t = 1; t <= 6; t++) for (let u = 1; u <= 6; u++) {
        const n = t * 10 + u;
        expect(rows.filter((r) => cellCovers(r.d66, n)).length, `${name} ${n}`).toBe(1);
      }
    }
  });
  it('every d66 on the clash and drop tables, and every 2d6 on task tables, is covered', () => {
    const clash = Object.values(rules.data.clashes).flat();
    for (let n = 11; n <= 66; n++) if (isD66(n)) {
      expect(clash.filter((r) => cellCovers(r.d66, n)).length, `clash ${n}`).toBe(1);
      expect(lookup(rules.data.drop_table, n), `drop ${n}`).toBeTruthy();
    }
    for (const [name, rows] of Object.entries(rules.data.task_tables)) for (let n = 2; n <= 12; n++) expect(lookup(rows, n), `${name} ${n}`).toBeTruthy();
    for (const rows of Object.values(rules.data.story_events)) for (let n = 1; n <= 6; n++) expect(lookup(rows, n)).toBeTruthy();
  });
  it('extra dice keep the best two, missing dice the lowest two, capped', () => {
    const seq = [0.99, 0.0, 0.5, 0.2]; let i = 0;
    const rng = () => seq[i++ % seq.length];
    const up = rollPool(2, rules.crew.dice.netEdgeCap.value, rng);
    expect(up.dice.length).toBe(4);
    expect(up.total).toBe(Math.max(...up.dice) + [...up.dice].sort((a, b) => b - a)[1]);
    const down = rollPool(-9, rules.crew.dice.netEdgeCap.value, Math.random);
    expect(down.dice.length).toBe(2 + rules.crew.dice.netEdgeCap.value);
  });
  it('severity from a margin and from a shot total (3.4)', () => {
    expect(severityOfMargin(rules.data.severity, 2)).toBe('Glance');
    expect(severityOfMargin(rules.data.severity, 5)).toBe('Solid');
    expect(severityOfMargin(rules.data.severity, 9)).toBe('Crushing');
    const keys = Object.keys(rules.data.consequences);
    expect(shotSeverity(rules, 6)).toBeNull();
    expect(shotSeverity(rules, 8)).toBe(keys[0]);
    expect(shotSeverity(rules, 12)).toBe(keys[keys.length - 1]);
    expect(bandLower(rules, keys[1])).toBe(keys[0]);
    expect(bandLower(rules, keys[0])).toBeNull();
  });
});

describe('the battle companion (5, 6, 9)', () => {
  it('two lasting conditions put a fighter down, and clear their states', () => {
    const { crew, b } = battleCrew();
    const [c1, c2] = rules.data.lasting_conditions.map((c) => plain(c.Condition));
    let bf = toggleState(rules, b.fighters[crew.fighters[0].id], rules.crew.battle.cancellingStates.value[0]);
    bf = addCondition(rules, bf, c1);
    expect(positions(rules).find((p) => p.name === bf.position)?.down).toBeFalsy();
    bf = addCondition(rules, bf, c2);
    expect(positions(rules).find((p) => p.name === bf.position)?.down).toBe(true);
    expect(bf.states).toEqual([]);
  });
  it('Hyped and Shook cancel; one of each', () => {
    const { crew, b } = battleCrew();
    const [a, c] = rules.crew.battle.cancellingStates.value;
    let bf = toggleState(rules, b.fighters[crew.fighters[0].id], a);
    expect(bf.states).toEqual([a]);
    bf = toggleState(rules, bf, c);
    expect(bf.states).toEqual([]);
  });
  it('states that end at the fighter\'s own activation clear when it ends', () => {
    const ending = statesEndingOnActivation(rules);
    expect(ending.length).toBeGreaterThan(0);
    const { crew, b } = battleCrew();
    let bf = b.fighters[crew.fighters[0].id];
    for (const s of ending) bf = toggleState(rules, bf, s);
    bf = endActivation(rules, bf);
    expect(bf.states).toEqual([]);
    expect(bf.activated).toBe(true);
    expect(nextRound({ ...b, fighters: { x: bf } }).fighters.x.activated).toBe(false);
  });
  it('five rounds, then a d6, never past seven (11.3)', () => {
    const r = rules.crew.battle.rounds;
    expect(roundEnd(rules, r.value - 1)).toBe('continue');
    expect(roundEnd(rules, r.value)).toBe('roll');
    expect(roundEnd(rules, r.max)).toBe('over');
  });
  it('bots use their own condition names and never gasp', () => {
    const c = crewOf(CG);
    const bot = { species: rules.crew.limits.botSpecies.value };
    const row = rules.data.lasting_conditions.find((x) => !/^\(/.test(plain(x['Bot name'])))!;
    expect(conditionLabel(rules, bot, plain(row.Condition))).toBe(plain(row['Bot name']));
    expect(conditionsFor(rules, bot).length).toBeLessThan(conditionsFor(rules, c.fighters[0]).length);
  });
  it('Words: two, plus Big mouth; none for a faction that swears none', () => {
    const c = crewOf(plainFaction);
    expect(wordsAllowed(rules, c)).toBe(rules.crew.battle.wordsPerSide.value);
    const bm = { ...c, fighters: c.fighters.map((f) => (f.id === c.captainId ? { ...f, captainTraits: [{ name: BIG_MOUTH }] } : f)) };
    expect(wordsAllowed(rules, bm)).toBe(rules.crew.battle.wordsPerSide.value + 1);
    expect(wordsAllowed(rules, crewOf(CG))).toBe(0);
  });
  it('fighters start with the states their card carries', () => {
    const s = rules.crew.battle.cancellingStates.value[0];
    const c = patchFighter(finishCreation(rules, crewOf(plainFaction)), 0, { nextBattle: [s] });
    expect(newBattle(rules, c).fighters[c.fighters[0].id].states).toEqual([s]);
  });
});

describe('after the battle (13, 14)', () => {
  it('generic XP: came home, put-downs capped at 2, did the job, underdog', () => {
    const { crew, b } = battleCrew();
    const id = crew.fighters[0].id;
    const b2: Battle = { ...b, didJob: id, opponentFighters: 9, opponentXp: 60, fighters: { ...b.fighters, [id]: { ...b.fighters[id], putDowns: 5 } } };
    const xp = battleXp(rules, crew, b2, id);
    const total = xp.reduce((a, l) => a + l.xp, 0);
    // came home 1 + put-downs 2 + did the job 1 + underdog 2
    expect(total).toBe(1 + rules.crew.battle.putDownXpMax.value + 1 + 2);
    const down = { ...b2, fighters: { ...b2.fighters, [id]: { ...b2.fighters[id], position: pos((p) => p.injury === 'heldField') } } };
    expect(battleXp(rules, crew, down, id).some((l) => l.label === rules.crew.afterBattle.genericXp.value.cameHome)).toBe(false);
  });
  it('Word XP by tier, plus one for a boast; silly table and Legend by tier', () => {
    const small = rules.deeds.find((d) => d.tier === 'Small deeds')!;
    const big = rules.deeds.find((d) => d.tier === 'Big deeds')!;
    expect(wordXp(rules, { deed: small.id, audience: 'Vow', result: 'fulfilled' })).toBe(rules.data.deed_tiers['Small deeds'].xp);
    expect(wordXp(rules, { deed: big.id, audience: rules.crew.battle.boastAudience.value, result: 'fulfilled' })).toBe(rules.data.deed_tiers['Big deeds'].xp + 1);
    expect(wordXp(rules, { deed: big.id, audience: 'Vow', result: 'failed' })).toBe(0);
    expect(sillyTableFor(rules, small.id)).toBe('Mild');
    expect(sillyTableFor(rules, big.id)).toBe('Sillier');
    expect(legendFor(rules, small.id)).toBeNull();
    expect(legendFor(rules, big.id)?.title).toBeTruthy();
  });
  it('which injury table (13.2)', () => {
    const { crew, b } = battleCrew();
    const id = crew.fighters[0].id;
    const at = (p: string, held = false) => injuryTableFor(rules, { ...b, heldField: held, fighters: { ...b.fighters, [id]: { ...b.fighters[id], position: p } } }, id);
    const T = rules.crew.afterBattle.injuryTables.value;
    expect(at(positions(rules)[0].name)).toBeNull();
    expect(at(pos((p) => p.injury === 'heldField'))?.table).toBe(T.harsh);
    expect(at(pos((p) => p.injury === 'heldField'), true)?.table).toBe(T.gentle);
    expect(at(pos((p) => !!p.captured))?.table).toBe(T.gentle);
    expect(at(pos((p) => p.injury === 'harshTwice'))).toEqual({ table: T.harsh, times: 2 });
  });
  it('reads what an injury result asks for', () => {
    const T = rules.crew.afterBattle.injuryTables.value;
    const dead = rules.data.injury_tables[T.gentle].find((r) => plain(r.Result) === rules.crew.afterBattle.deadResult.value)!;
    expect(injuryActions(rules, dead.Result)).toEqual([{ kind: 'dead', value: rules.crew.afterBattle.deadResult.value }]);
    const lasting = rules.data.injury_tables[T.harsh].find((r) => /heavy/i.test(r.Result) && /Lasting/.test(r.Result))!;
    expect(injuryActions(rules, lasting.Result).some((x) => x.kind === 'injuryList')).toBe(true);
    expect(injuryResult(rules, T.gentle, 11)).toBeTruthy();
    const walk = injuryActions(rules, injuryResult(rules, T.gentle, 11)!.Result);
    expect(walk[0].kind).toBe('status');
    // Bad stitches is "As Sore"
    const bs = rules.data.recovery_words.find((r) => /^As /.test(r.Effect))!;
    expect(rules.crew.campaign.statuses.value).toContain(statusForWord(rules, plain(bs['Recovery word'])));
    expect(botWord(rules, plain(rules.data.bot_words[0]['Organic result']))).toBe(plain(rules.data.bot_words[0]['Bot result']));
  });
  it('league points follow the table (15.2)', () => {
    const { crew, b } = battleCrew();
    const id = crew.fighters[0].id;
    const big = rules.deeds.find((d) => d.tier === 'Big deeds')!;
    const b2: Battle = { ...b, winCond: true, heldField: true, stoodGround: true, fighters: { ...b.fighters, [id]: { ...b.fighters[id], word: { deed: big.id, audience: rules.crew.battle.boastAudience.value, result: 'fulfilled' } } } };
    expect(totalLeaguePoints(rules, b2)).toBe(3 + 1 + 1 + 2 + 1);
    expect(leaguePoints(rules, b2).every((r) => r.label)).toBe(true);
    expect(totalLeaguePoints(rules, { ...b, stoodGround: false })).toBe(0);
  });
  it('tasks: tests, targets, pay and tables, plus the faction task', () => {
    const c = crewOf(plainFaction);
    const defs = taskDefs(rules, c);
    expect(defs.length).toBe(rules.data.tasks.length + 1);
    for (const d of defs) { expect(d.target, d.name).toBeGreaterThan(0); expect(d.table.length, d.name).toBeGreaterThan(0); }
    expect(defs.find((d) => d.own)?.die).toBe(rules.crew.afterBattle.taskTableDie.ownTask);
    expect(defs.some((d) => d.ratings === 'any')).toBe(true);
    expect(partsIn('**6 parts**')).toBe(6);
    expect(partsIn('Nothing')).toBeNull();
    expect(taskBlocked(rules, { ...c.fighters[0], status: rules.crew.afterBattle.taskBlockedStatuses.value[0] })).toBe(true);
  });
  it('a new break clears statuses and sellers, and keeps the battle for the steps', () => {
    let c = finishCreation(rules, crewOf(plainFaction));
    const item = rules.shopItems.find((i) => needsSeller(rules, c, i))!;
    c = setSellerResult(rules, c, item.id, 1);
    c = patchFighter(c, 0, { status: rules.crew.campaign.statuses.value[2] });
    c = { ...c, battle: newBattle(rules, c) };
    const next = startAfterBattle(rules, c);
    expect(next.battle).toBeNull();
    expect(next.after?.battle.phase).toBe('ended');
    expect(next.sellers).toEqual({});
    expect(next.fighters[0].status).toBe(rules.crew.campaign.statuses.value[0]);
  });
});

describe('old-stock sellers (9.3)', () => {
  it('a failed roll makes the item unavailable this break; a success or "found" makes it available', () => {
    const c = crewOf(plainFaction);
    const item = rules.shopItems.find((i) => needsSeller(rules, c, i))!;
    const t = sellerTarget(rules, c).value;
    expect(sellerState(c, item.id)).toBe('unknown');
    expect(sellerState(setSellerResult(rules, c, item.id, t - 1), item.id)).toBe('none');
    expect(sellerState(setSellerResult(rules, c, item.id, t), item.id)).toBe('found');
    expect(sellerState(setSellerResult(rules, c, item.id, null), item.id)).toBe('found');
  });
});
