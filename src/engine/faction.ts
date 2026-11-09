// Faction rules the app acts on, read from crew-rules.json factions[].effects,
// taskPay and typeRules. The text shown is always the book's own (factions.json).
import { plain, type Rules } from '../data/rules';
import type { Effect } from '../data/schema';
import { captainOf, captainTraitNames, isBot, ruleActive } from './crew';
import { positionDef } from './battle';
import type { Battle, Crew, Fighter } from './model';

export interface ActiveEffect { effect: Effect; title: string; text: string; section: string }

/** Is this effect in force for the crew? A numbered rule is off when the subfaction replaces it (10.1). */
export function effectActive(rules: Rules, crew: Crew, e: { rule?: number; subfaction?: string }): boolean {
  if (e.subfaction) return crew.subfaction === e.subfaction;
  return ruleActive(rules, crew, e.rule);
}

export function activeEffects(rules: Rules, crew: Crew, when?: Effect['when']): ActiveEffect[] {
  const fac = rules.faction(crew.faction ?? '');
  const fr = rules.factionRules(crew.faction ?? '');
  if (!fac || !fr) return [];
  return (fr.effects ?? []).filter((e) => (!when || e.when === when) && effectActive(rules, crew, e)).map((e) => {
    let title = fac.name;
    let text = '';
    if (e.subfaction) { const s = fac.subfactions.find((x) => x.name === e.subfaction); title = `${e.subfaction}`; text = s?.rule ?? ''; }
    else if (e.rule) { const r = fac.rules.find((x) => x.n === e.rule); title = `${e.rule}. ${r?.name ?? ''}`; text = r?.text ?? ''; }
    else if (e.when === 'captive') { title = 'Captive fate'; text = fac.captiveFate.replace(/^\*\*Captive fate:?\s*/, '**'); }
    if (e.type) { const t = fac.types.find((x) => x.name === e.type); title = e.type; text = t?.trait ?? text; }
    return { effect: e, title, text, section: fac.section };
  });
}

/** Every rule of the crew's faction that is in force: numbered rules not replaced, the subfaction's, and the types. */
export function rulesInForce(rules: Rules, crew: Crew): { title: string; text: string }[] {
  const fac = rules.faction(crew.faction ?? '');
  if (!fac) return [];
  const sub = fac.subfactions.find((s) => s.name === crew.subfaction);
  const out = fac.rules.filter((r) => ruleActive(rules, crew, r.n)).map((r) => ({ title: `${r.n}. ${r.name}`, text: r.text }));
  if (sub) out.push({ title: `${sub.name}${crew.replacedRule ? ` (replaces ${crew.replacedRule})` : ''}`, text: sub.rule });
  const types = new Set(crew.fighters.map((f) => f.type).filter(Boolean));
  for (const t of fac.types) if (types.has(t.name)) out.push({ title: t.label, text: t.trait });
  return out;
}

export function typeRule(rules: Rules, crew: Crew, f: Pick<Fighter, 'type'>) {
  return f.type ? rules.factionRules(crew.faction ?? '')?.typeRules?.[f.type] : undefined;
}

// ---------- tasks ----------
export interface TaskPayResult { parts: number | null; xp: number; notes: string[] }

/** A task's pay after faction rules, captain traits and tags (10.5, 9.2, 14.10). */
export function taskPay(rules: Rules, crew: Crew, task: string, success: boolean, basePay: number | null): TaskPayResult {
  const fr = rules.factionRules(crew.faction ?? '');
  const cap = captainOf(crew);
  const capTraits = cap ? captainTraitNames(cap) : [];
  const mods = [
    ...(fr?.taskPay ?? []).filter((m) => effectActive(rules, crew, m)).map((m) => ({ ...m, why: m.subfaction ?? `${crew.faction} rule ${m.rule}` })),
    ...rules.crew.taskPay.value.filter((m) => (!m.captainTrait || capTraits.includes(m.captainTrait)) && (!m.tag || crew.notes.tags.includes(m.tag))).map((m) => ({ ...m, why: m.captainTrait ?? m.tag ?? '' })),
  ].filter((m) => m.task === task);
  let parts = basePay;
  let xp = 0;
  const notes: string[] = [];
  const set = mods.find((m) => m.setParts !== undefined);
  if (set) { parts = set.setParts!; notes.push(`${set.why}: pays ${set.setParts}`); xp += (success ? set.xpSuccess : set.xpFailure) ?? 0; if (xp) notes.push(`${set.why}: +${xp} XP`); return { parts, xp, notes }; }
  for (const m of mods) {
    if (m.parts && success && parts !== null) { parts += m.parts; notes.push(`${m.why}: ${m.parts > 0 ? '+' : ''}${m.parts}`); }
  }
  return { parts: parts === null ? null : Math.max(0, parts), xp, notes };
}

// ---------- after the battle ----------
export interface FactionAnswers {
  asks: Record<string, boolean | number>;
  stars: Record<string, number>;
  researchDone: boolean;
  researchWho: string | null;
}

export interface FactionResult {
  xp: { fid: string; label: string; xp: number }[];
  parts: { label: string; amount: number; factionPay: boolean }[];
  capped: number;
}

/** Faction XP and parts after a battle (chapter 10), with the faction pay cap (10.1). */
export function factionAfterBattle(rules: Rules, crew: Crew, b: Battle, ans: FactionAnswers): FactionResult {
  const xp: FactionResult['xp'] = [];
  const parts: FactionResult['parts'] = [];
  const took = crew.fighters.filter((f) => b.fighters[f.id]?.inBattle);
  const standing = (fid: string) => !!positionDef(rules, b.fighters[fid].position)?.onTable;
  const worlds = crew.notes.season.map((s) => s.world.trim().toLowerCase()).filter(Boolean);
  for (const { effect: e, title } of activeEffects(rules, crew, 'afterBattle')) {
    const a = ans.asks[e.id];
    switch (e.kind) {
      case 'xpEach': {
        if (e.ask && !a) break;
        if (e.condition === 'newWorld' && (!b.world.trim() || worlds.includes(b.world.trim().toLowerCase()))) break;
        const who = e.who === 'standingShook' ? took.filter((f) => standing(f.id) && (!e.state || b.fighters[f.id].states.includes(e.state))) : took;
        for (const f of who) xp.push({ fid: f.id, label: title, xp: e.amount ?? 0 });
        break;
      }
      case 'partsPer': {
        const n = e.per === 'putDowns' ? took.reduce((s, f) => s + b.fighters[f.id].putDowns, 0)
          : e.per === 'spectacular' ? took.reduce((s, f) => s + (b.fighters[f.id].spectacular ?? 0), 0)
          : Number(a) || 0;
        if (n) parts.push({ label: `${title} (${n})`, amount: n * (e.amount ?? 0), factionPay: !!e.factionPay });
        break;
      }
      case 'partsIf':
        if (a) parts.push({ label: title, amount: e.amount ?? 0, factionPay: !!e.factionPay });
        break;
      case 'rating':
        for (const f of took) {
          const s = ans.stars[f.id];
          if (e.high && s === e.high.value) { if (e.high.xp) xp.push({ fid: f.id, label: `${title}: ${s} stars`, xp: e.high.xp }); if (e.high.parts) parts.push({ label: `${title}: ${f.name}`, amount: e.high.parts, factionPay: !!e.factionPay }); }
          if (e.low && s === e.low.value) { if (e.low.xp) xp.push({ fid: f.id, label: `${title}: ${s} star`, xp: e.low.xp }); if (e.low.parts) parts.push({ label: `${title}: ${f.name} (fee)`, amount: e.low.parts, factionPay: false }); }
        }
        break;
    }
  }
  // Research tasks are chosen before deployment (setup) and paid here.
  for (const { effect: e, title } of activeEffects(rules, crew, 'setup')) {
    if (e.kind === 'research' && ans.researchDone && ans.researchWho) xp.push({ fid: ans.researchWho, label: title, xp: e.amount ?? 0 });
  }
  // The faction pay cap: gains from faction rules total at most the cap.
  const cap = rules.crew.factionPayCap.value;
  let gained = 0;
  let capped = 0;
  const out = parts.map((p) => {
    if (!p.factionPay || p.amount <= 0) return p;
    const room = Math.max(0, cap - gained);
    const amount = Math.min(room, p.amount);
    capped += p.amount - amount;
    gained += amount;
    return { ...p, amount };
  });
  return { xp, parts: out, capped };
}

/** Fighters who may take research XP: of the listed types, who took part. */
export function researchEligible(rules: Rules, crew: Crew, b: Battle): Fighter[] {
  const e = activeEffects(rules, crew, 'setup').find((x) => x.effect.kind === 'research')?.effect;
  if (!e) return [];
  return crew.fighters.filter((f) => b.fighters[f.id]?.inBattle && (!e.eligibleTypes || e.eligibleTypes.includes(f.type ?? '')));
}

/** The faction's Word kind bonus: the first fulfilled Word of that kind gives +1 XP (10.1). */
export function factionWordBonus(rules: Rules, crew: Crew, b: Battle): { fid: string; label: string; xp: number } | null {
  const kind = rules.factionRules(crew.faction ?? '')?.wordKind?.value;
  if (!kind) return null;
  const f = crew.fighters.find((x) => b.fighters[x.id]?.inBattle && b.fighters[x.id].word?.result === 'fulfilled' && b.fighters[x.id].word!.audience === kind);
  return f ? { fid: f.id, label: `${crew.faction}'s kind of Word (${kind})`, xp: 1 } : null;
}

/** Put-down XP that a type gives away (Stunt double: to an Action star, 10.7). */
export function putDownXpTarget(rules: Rules, crew: Crew, f: Fighter): string | null {
  return typeRule(rules, crew, f)?.putDownXpTo ?? null;
}

export const isBotFighter = (rules: Rules, f: Fighter) => isBot(rules, f);
export const effectText = (s: string) => plain(s);

/** A type may never take a title (Stunt double, 10.7). */
export const canTakeTitle = (rules: Rules, crew: Crew, f: Pick<Fighter, 'type'>) => !typeRule(rules, crew, f)?.noTitle;

/** A task's pay after a table row that cancels, halves or doubles it. "Pays double" doubles the printed pay only (10.3). */
export function taskPayWithTable(rules: Rules, crew: Crew, task: string, success: boolean, printed: number | null, mult?: number): TaskPayResult {
  const doublePrinted = mult === 2 && rules.crew.afterBattle.taskPayDoubleIsPrinted.value;
  const tp = taskPay(rules, crew, task, success, doublePrinted && success && printed !== null ? printed * 2 : printed);
  if (mult === undefined || doublePrinted || tp.parts === null) return tp;
  return { ...tp, parts: Math.floor(tp.parts * mult) };
}

/** A title with a prefix, after any leading word such as "the": "the Young Hammer" (10.7). */
export function prefixTitle(title: string, prefix: string, after?: string): string {
  if (after && title.toLowerCase().startsWith(`${after.toLowerCase()} `)) return `${title.slice(0, after.length)} ${prefix} ${title.slice(after.length + 1)}`;
  return `${prefix} ${title}`;
}
