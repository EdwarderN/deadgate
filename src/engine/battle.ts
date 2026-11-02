// The battle companion and the after-battle steps (chapters 5, 6, 9, 13, 14).
// All names, numbers and tables come from the rules data.
import { plain, type Rules } from '../data/rules';
import type { Row } from '../data/schema';
import { battery, captainOf, captainTraitNames, currentRatings, isBot, partsLeft, strength, underdog } from './crew';
import { cellCovers, lookup } from './dice';
import { uid, type AfterBattle, type Battle, type BattleFighter, type Crew, type Fighter } from './model';

const B = (r: Rules) => r.crew.battle;

export const positions = (rules: Rules) => B(rules).positions.value;
export const positionDef = (rules: Rules, name: string) => positions(rules).find((p) => p.name === name);
export const stateNames = (rules: Rules) => rules.data.states.map((s) => plain(s.State));
export const conditionNames = (rules: Rules) => rules.data.lasting_conditions.map((c) => plain(c.Condition));

/** A condition's name for this fighter: bots use the bot name (6.3). */
export function conditionLabel(rules: Rules, f: Pick<Fighter, 'species'>, name: string): string {
  const row = rules.data.lasting_conditions.find((c) => plain(c.Condition) === name);
  if (!row || !isBot(rules, f)) return name;
  const bot = plain(row['Bot name']);
  return /^\(.*\)$/.test(bot) ? name : bot;
}
/** Conditions a fighter can have: bots skip those with no bot name. */
export function conditionsFor(rules: Rules, f: Pick<Fighter, 'species'>): string[] {
  return rules.data.lasting_conditions.filter((c) => !isBot(rules, f) || !/^\(.*\)$/.test(plain(c['Bot name']))).map((c) => plain(c.Condition));
}

// ---------- setup ----------
export function newBattle(rules: Rules, crew: Crew): Battle {
  const first = positions(rules)[0].name;
  const fighters: Record<string, BattleFighter> = {};
  for (const f of crew.fighters) {
    const bat = battery(rules, crew, f);
    const states = (f.nextBattle ?? []).filter((s) => stateNames(rules).includes(s));
    const pos = (f.nextBattle ?? []).find((s) => positions(rules).some((p) => p.name === s)) ?? first;
    fighters[f.id] = {
      inBattle: f.status !== 'Laid up', energy: bat.now, conditions: [], states, position: pos,
      activated: false, reactionUsed: false, dents: 0, putDowns: 0, word: null, notes: '',
    };
  }
  return {
    id: uid('b'), started: new Date().toISOString(), opponent: '', opponentFighters: null, opponentXp: null, round: 1, phase: 'setup',
    fighters, log: [], winCond: false, didJob: null, heldField: false, stoodGround: true, world: '',
  };
}

/** How many Words the crew may swear (13.5): two, plus Big mouth and Showboats. */
export function wordsAllowed(rules: Rules, crew: Crew, b?: Battle | null): number {
  const w = B(rules).wordsPerSide;
  if (rules.factionRules(crew.faction ?? '')?.noWords) return 0;
  // The Final: more Words, and nothing adds to them (14.13).
  if (b?.final) return rules.crew.final.words.value;
  let n = w.value;
  const cap = captainOf(crew);
  if (cap && captainTraitNames(cap).includes(w.extraFrom.captainTrait)) n++;
  if (crew.notes.tags.includes(w.extraFrom.tag)) n++;
  return n;
}

export function canSwear(rules: Rules, crew: Crew, f: Fighter): boolean {
  return !isBot(rules, f) && !rules.factionRules(crew.faction ?? '')?.noWords;
}

// ---------- on the table ----------
export function addCondition(rules: Rules, bf: BattleFighter, name: string): BattleFighter {
  const conditions = [...bf.conditions, name];
  const down = conditions.length >= B(rules).conditionsToDown.value;
  const downPos = positions(rules).find((p) => p.down && p.injury === 'heldField')?.name;
  return { ...bf, conditions, position: down && downPos ? downPos : bf.position, states: down ? [] : bf.states };
}

/** Toggle a state: one of each, and Hyped and Shook cancel at once (5.9). */
export function toggleState(rules: Rules, bf: BattleFighter, name: string): BattleFighter {
  if (bf.states.includes(name)) return { ...bf, states: bf.states.filter((s) => s !== name) };
  const pair = B(rules).cancellingStates.value;
  if (pair.includes(name)) {
    const other = pair.find((p) => p !== name && bf.states.includes(p));
    if (other) return { ...bf, states: bf.states.filter((s) => s !== other) };
  }
  return { ...bf, states: [...bf.states, name] };
}

/** States that end at the end of the fighter's own activation (5.9). */
export function statesEndingOnActivation(rules: Rules): string[] {
  const k = B(rules).endsOnOwnActivation.value.toLowerCase();
  return rules.data.states.filter((s) => s['When it ends'].toLowerCase().includes(k)).map((s) => plain(s.State));
}

export function endActivation(rules: Rules, bf: BattleFighter): BattleFighter {
  const ending = statesEndingOnActivation(rules);
  return { ...bf, activated: true, states: bf.states.filter((s) => !ending.includes(s)) };
}

export function nextRound(b: Battle): Battle {
  const fighters = Object.fromEntries(Object.entries(b.fighters).map(([k, f]) => [k, { ...f, activated: false, reactionUsed: false }]));
  return { ...b, round: b.round + 1, fighters };
}

/** After round N: is a d6 needed to go on, and can the battle go on at all (9.3)? */
export function roundEnd(rules: Rules, round: number): 'continue' | 'roll' | 'over' {
  const r = B(rules).rounds;
  if (round >= r.max) return 'over';
  if (round >= r.value) return 'roll';
  return 'continue';
}

export const isDown = (rules: Rules, bf: BattleFighter) => !!positionDef(rules, bf.position)?.down;

/** Severity of a shot total (3.4): the consequence tables are headed with their number. */
export function shotSeverity(rules: Rules, total: number): string | null {
  let best: string | null = null;
  for (const k of Object.keys(rules.data.consequences)) {
    const n = +(k.match(/\((\d+)\)/)?.[1] ?? NaN);
    if (total >= n) best = k;
  }
  return best;
}

/** The consequence table one band lower (Thick hide, 6.1), or null for "no effect at all". */
export function bandLower(rules: Rules, table: string): string | null {
  const keys = Object.keys(rules.data.consequences);
  const i = keys.indexOf(table);
  return i > 0 ? keys[i - 1] : null;
}

// ---------- after the battle ----------
export const RUMOUR = 'rumour:';
/** A Word's tier and XP: a deed's, or an arrival's rumour (a Big vow worth its own XP, 13.9). */
export function deedTier(rules: Rules, deedId: string): { tier: string; xp: number } | null {
  if (deedId.startsWith(RUMOUR)) { const r = B(rules).rumourWord; return { tier: r.tier, xp: r.value }; }
  const d = rules.deeds.find((x) => x.id === deedId);
  if (!d) return null;
  return rules.data.deed_tiers[d.tier] ?? null;
}
export const wordName = (rules: Rules, deedId: string) => (deedId.startsWith(RUMOUR) ? `Rumour: ${deedId.slice(RUMOUR.length)}` : `${deedId} ${rules.deeds.find((d) => d.id === deedId)?.name ?? ''}`);
/** Is this Word Big or Legendary (it makes a legend, 13.8, 14.5)? */
export const makesLegend = (rules: Rules, deedId: string) => B(rules).legendTiers.value.includes(deedTier(rules, deedId)?.tier ?? '');

/** A wager's stake (13.5): won when fulfilled, paid when failed. None without a taker, or for a crew nobody bets against (14.10). */
export function wagerStake(rules: Rules, crew: Crew, w: BattleFighter['word']): number {
  const s = B(rules).wagerStakes;
  if (!w || w.audience !== s.audience || w.taker === false || crew.notes.tags.includes(s.noTakerTag) || !w.result) return 0;
  const n = s.value[deedTier(rules, w.deed)?.tier ?? ''] ?? 0;
  return w.result === 'fulfilled' ? n : -n;
}

export function wordXp(rules: Rules, w: BattleFighter['word']): number {
  if (!w || w.result !== 'fulfilled') return 0;
  const t = deedTier(rules, w.deed);
  if (!t) return 0;
  return t.xp + (w.audience === B(rules).boastAudience.value ? B(rules).boastXpBonus.value : 0);
}

export function sillyTableFor(rules: Rules, deedId: string): string | null {
  const t = deedTier(rules, deedId);
  return t ? B(rules).sillyTables.value[t.tier] ?? null : null;
}

export function legendFor(rules: Rules, deedId: string) {
  if (deedId.startsWith(RUMOUR)) return rules.legends.find((l) => l.from === `Rumour: ${deedId.slice(RUMOUR.length)}`) ?? null;
  const d = rules.deeds.find((x) => x.id === deedId);
  if (!d?.legend) return null;
  return rules.legends.find((l) => l.from.startsWith(d.id)) ?? null;
}

export interface XpLine { label: string; xp: number }

/** Generic, Word and underdog XP for one fighter (13.4, 13.5, 11.5). */
export function battleXp(rules: Rules, crew: Crew, b: Battle, fid: string): XpLine[] {
  const bf = b.fighters[fid];
  if (!bf?.inBattle) return [];
  const gx = rules.crew.afterBattle.genericXp.value;
  const row = (name: string) => parseInt(rules.data.generic_xp.find((r) => plain(r.Deed).startsWith(name))?.XP ?? '0', 10) || 0;
  const out: XpLine[] = [];
  if (positionDef(rules, bf.position)?.cameHome) out.push({ label: gx.cameHome, xp: row(gx.cameHome) });
  const downs = Math.min(bf.putDowns, B(rules).putDownXpMax.value);
  const f = crew.fighters.find((x) => x.id === fid);
  const givesAway = !!(f?.type && rules.factionRules(crew.faction ?? '')?.typeRules?.[f.type]?.putDownXpTo);
  if (downs && !givesAway) out.push({ label: `${gx.putDown} x${downs}`, xp: downs * row(gx.putDown) });
  if (b.didJob === fid) out.push({ label: gx.didJob, xp: row(gx.didJob) });
  const wx = wordXp(rules, bf.word);
  if (wx) out.push({ label: `Word: ${bf.word!.deed}`, xp: wx });
  const ud = underdogFor(rules, crew, b);
  if (ud.underdog === 'us') out.push({ label: 'Underdog', xp: ud.xp });
  return out;
}

export function underdogFor(rules: Rules, crew: Crew, b: Battle) {
  if (b.opponentFighters === null) return { underdog: null, diff: 0, xp: 0 } as ReturnType<typeof underdog>;
  return underdog(rules, strength(crew), b.opponentFighters * 10 + (b.opponentXp ?? 0));
}

/** Which injury table a fighter rolls, and how many times (13.2). */
export function injuryTableFor(rules: Rules, b: Battle, fid: string, crew?: Crew): { table: string; times: number } | null {
  const bf = b.fighters[fid];
  const p = bf && positionDef(rules, bf.position);
  if (!bf?.inBattle || !p?.injury) return null;
  const t = rules.crew.afterBattle.injuryTables.value;
  // A type may always roll one table (a Volunteer rolls the gentle one, 12.6).
  const f = crew?.fighters.find((x) => x.id === fid);
  const forced = f?.type && crew ? rules.factionRules(crew.faction ?? '')?.typeRules?.[f.type]?.injuryTable : undefined;
  if (forced && (p.injury === 'harsh' || p.injury === 'heldField')) return { table: t[forced], times: 1 };
  switch (p.injury) {
    case 'gentle': return { table: t.gentle, times: 1 };
    case 'harsh': return { table: t.harsh, times: 1 };
    case 'harshTwice': return { table: t.harsh, times: 2 };
    case 'heldField': return { table: b.heldField ? t.gentle : t.harsh, times: 1 };
  }
}

export function injuryResult(rules: Rules, table: string, roll: number): Row | undefined {
  return lookup(rules.data.injury_tables[table] ?? [], roll);
}

export interface InjuryAction { kind: 'status' | 'injuryList' | 'dead'; value: string; word?: string }

/** The status a recovery word leaves: itself if it is a status, or the one its effect is "As" (13.2). */
export function statusForWord(rules: Rules, word: string): string | null {
  const statuses = rules.crew.campaign.statuses.value;
  if (statuses.includes(word)) return word;
  const eff = rules.data.recovery_words.find((r) => plain(r['Recovery word']) === word)?.Effect ?? '';
  const m = eff.match(/^As (\w[\w ]*?)\b[,.]/);
  return m && statuses.includes(m[1]) ? m[1] : null;
}

/** What a result row asks for, read from its words: a recovery word, a lasting injury list, or death. */
export function injuryActions(rules: Rules, resultText: string): InjuryAction[] {
  const text = plain(resultText);
  const dead = rules.crew.afterBattle.deadResult.value;
  if (text.trim() === dead) return [{ kind: 'dead', value: dead }];
  const out: InjuryAction[] = [];
  const lists = Array.from(new Set(rules.injuries.map((i) => i.table)));
  for (const l of lists) if (new RegExp(`\\(${l}\\)|${l} list`, 'i').test(text)) out.push({ kind: 'injuryList', value: l });
  const words = rules.data.recovery_words.map((r) => plain(r['Recovery word'])).filter((w) => text.includes(w));
  words.sort((a, b) => text.indexOf(a) - text.indexOf(b));
  if (words[0]) out.push({ kind: 'status', value: statusForWord(rules, words[0]) ?? rules.crew.campaign.statuses.value[0], word: words[0] });
  return out;
}

/** The bot's own word for a result (13.3). */
export function botWord(rules: Rules, word: string): string {
  const r = rules.data.bot_words.find((x) => plain(x['Organic result']) === word);
  return r ? plain(r['Bot result']) : word;
}

/** League points from the battle (14.12), row by row. */
export function leaguePoints(rules: Rules, b: Battle): { label: string; count: number; points: number }[] {
  const map = rules.crew.afterBattle.leaguePoints.value;
  const words = Object.values(b.fighters).filter((f) => f.inBattle && f.word?.result === 'fulfilled').map((f) => f.word!);
  return rules.data.league_points.map((r) => {
    const label = plain(r.What).replace(/:.*$/, '').replace(/\s*\(.*\)\s*$/, '').trim();
    const how = map[label] ?? '';
    let count = 0;
    if (how === 'winCond') count = b.winCond ? 1 : 0;
    else if (how === 'heldField') count = b.heldField ? 1 : 0;
    else if (how === 'stoodGround') count = b.stoodGround ? 1 : 0;
    else if (how.startsWith('word:')) count = words.filter((w) => deedTier(rules, w.deed)?.tier === how.slice(5)).length;
    else if (how === 'boast') count = words.filter((w) => w.audience === B(rules).boastAudience.value).length;
    const pts = parseInt(r.Points.replace('+', ''), 10) || 0;
    return { label, count, points: count * pts };
  });
}

// ---------- tasks (14.6) ----------
export interface TaskDef { name: string; test: string; success: string; failure: string; ratings: string[] | 'any'; target: number | null; table: Row[]; die: string; own: boolean }

export function taskDefs(rules: Rules, crew: Crew): TaskDef[] {
  const diffs = rules.data.difficulties.map((d) => ({ name: plain(d.Difficulty), target: +d.Target }));
  const ratingsOf = (test: string) => {
    const names = rules.crew.limits.ratingNames.value.filter((r) => new RegExp(`\\b${r}\\b`).test(test));
    return names.length ? names : 'any' as const;
  };
  const targetOf = (test: string) => {
    const n = test.match(/\((\d+)\)/);
    if (n) return +n[1];
    return diffs.find((d) => test.includes(d.name))?.target ?? null;
  };
  const out: TaskDef[] = rules.data.tasks.map((t) => {
    const name = plain(t.Task);
    return { name, test: t.Test, success: t.Success, failure: t.Failure ?? '', ratings: ratingsOf(t.Test), target: targetOf(t.Test), table: rules.data.task_tables[name] ?? [], die: rules.crew.afterBattle.taskTableDie.value, own: false };
  });
  const fac = rules.faction(crew.faction ?? '');
  if (fac) {
    const m = plain(fac.ownTask).match(/^Own task:\s*(.+?)\s*\((.+?)\)\.\s*(.*)$/);
    if (m) out.push({ name: m[1], test: m[2], success: m[3], failure: '', ratings: ratingsOf(m[2]), target: targetOf(m[2]), table: fac.ownTaskTable, die: rules.crew.afterBattle.taskTableDie.ownTask, own: true });
  }
  return out;
}

/** Parts a task's pay line names ("**6 parts**"), or null. */
export function partsIn(text: string): number | null {
  const m = plain(text).match(/(\d+) parts?\b/);
  return m ? +m[1] : null;
}

export const taskBlocked = (rules: Rules, f: Fighter, crew?: Crew) =>
  rules.crew.afterBattle.taskBlockedStatuses.value.includes(f.status) || (crew !== undefined && f.hiredBreak !== undefined && f.hiredBreak === crew.breakNo);

// ---------- the break ----------
export function startAfterBattle(rules: Rules, crew: Crew): Crew {
  if (!crew.battle) return crew;
  const fit = rules.crew.campaign.statuses.value[0];
  const reset = rules.crew.afterBattle.resetStatusesAtBreak.value;
  // What is left in each battery stays there: batteries do not refill by themselves (14.3).
  const fighters = crew.fighters.map((f) => {
    const bf = crew.battle!.fighters[f.id];
    const energy = bf?.inBattle ? bf.energy : f.energy;
    return reset ? { ...f, status: fit, nextBattle: [], energy } : { ...f, energy };
  });
  // Single-use items used this battle are used up (grenades, 7.6).
  const su = rules.crew.gear.singleUse;
  const thrown: Record<string, number> = {};
  for (const bf of Object.values(crew.battle.fighters)) for (const [uid, n] of Object.entries(bf.thrown ?? {})) thrown[uid] = (thrown[uid] ?? 0) + n;
  const items = crew.items.flatMap((o) => {
    if (!thrown[o.uid]) return [o];
    const used = (o.used ?? 0) + thrown[o.uid];
    return used >= su.uses ? [] : [{ ...o, used }];
  });
  const after: AfterBattle = {
    step: 'battle', battle: { ...crew.battle, phase: 'ended' }, extraXp: {}, injuries: {}, done: {},
    story: { row: '', roll: null, notes: '' }, tasks: {}, history: {},
  };
  // A new break: sellers must be found again (11.3).
  return { ...crew, fighters, items, battle: null, after, sellers: {}, hireOffers: [], relicLead: null, breakNo: (crew.breakNo ?? 0) + 1 };
}

export function finishAfterBattle(crew: Crew): Crew {
  return { ...crew, after: null };
}

export const totalLeaguePoints = (rules: Rules, b: Battle) => leaguePoints(rules, b).reduce((a, r) => a + r.points, 0);

/** Old stock: is the item's seller known this break? */
export function sellerState(crew: Crew, itemId: string): 'unknown' | 'found' | 'none' {
  const s = crew.sellers?.[itemId];
  if (!s) return 'unknown';
  return s.found ? 'found' : 'none';
}

export { cellCovers, partsLeft };

// ---------- breaking (9.4) ----------
export interface BreakingStatus { needed: boolean; out: number; total: number; threshold: number; tester: Fighter | null; dice: number; notes: string[]; never: boolean }

/** Must the crew test to break this round, who tests, and with how many dice (9.4, faction rules, captain traits)? */
export function breakingStatus(rules: Rules, crew: Crew, b: Battle, effects: { kind: string; amount?: number; fraction?: number; captain?: string; title: string }[]): BreakingStatus {
  const br = B(rules).breaking;
  const took = crew.fighters.filter((f) => b.fighters[f.id]?.inBattle);
  const out = took.filter((f) => { const p = positionDef(rules, b.fighters[f.id].position); return p?.down || !p?.onTable; }).length;
  const fraction = effects.find((e) => e.kind === 'breakingThreshold')?.fraction ?? br.value;
  const threshold = br.roundUp ? Math.ceil(took.length * fraction) : Math.floor(took.length * fraction);
  const standing = (f: Fighter) => !!positionDef(rules, b.fighters[f.id].position)?.onTable && !positionDef(rules, b.fighters[f.id].position)?.down;
  const cap = captainOf(crew);
  const capStanding = !!cap && b.fighters[cap.id]?.inBattle && standing(cap);
  const nerve = (f: Fighter) => currentRatings(rules, f)[br.rating] ?? 0;
  let tester: Fighter | null = cap && capStanding && !isBot(rules, cap) ? cap : null;
  if (!tester) tester = took.filter((f) => standing(f) && !isBot(rules, f)).sort((x, y) => nerve(y) - nerve(x))[0] ?? null;
  const notes: string[] = [];
  let dice = tester ? nerve(tester) : 0;
  if (tester && tester.id === cap?.id) for (const [t, n] of Object.entries(br.captainTraits)) if (captainTraitNames(cap).includes(t)) { dice += n; notes.push(`${t} +${n}`); }
  for (const e of effects) {
    if (e.kind !== 'breakingDice') continue;
    if (e.captain === 'standing' && !capStanding) continue;
    if (e.captain === 'down' && capStanding) continue;
    dice += e.amount ?? 0;
    notes.push(`${e.title} ${(e.amount ?? 0) > 0 ? '+' : ''}${e.amount}`);
  }
  return { needed: took.length > 0 && out >= threshold, out, total: took.length, threshold, tester, dice, notes, never: !tester };
}
