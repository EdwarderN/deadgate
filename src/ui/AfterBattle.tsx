// After the battle and the break, in the book's order (13.1, 14.1), as a few
// short steps. Each step shows what it will record and records it on one tap.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { getRules, plain } from '../data/rules';
import {
  battleXp, botWord, finishAfterBattle, injuryActions, injuryResult, injuryTableFor, leaguePoints, legendFor, partsIn, positionDef,
  sillyTableFor, stateNames, taskBlocked, taskDefs, totalLeaguePoints,
} from '../engine/battle';
import {
  activeEffects, canTakeTitle, factionAfterBattle, factionWordBonus, putDownXpTarget, researchEligible, taskPay, type ActiveEffect,
} from '../engine/faction';
import { advancesEarned, airTax, currentRatings, hirePrice, isBot, ratingNames } from '../engine/crew';
import { lookup } from '../engine/dice';
import { applyChanges, deathFate, describe, readOutcomes, splitTwist, type Change, type Outcome } from '../engine/outcomes';
import { uid, type AfterBattle as After, type Crew, type Fighter } from '../engine/model';
import { go } from '../App';
import { Hire, Md, Shop, Stash, fighterLabel, type Update } from './common';
import { Experience } from './Campaign';
import { PoolRoller, RollOrEnter } from './Dice';
import { FactionNote } from './Battle';
import { useAsk } from './confirm';
import { RuleLink, injuryRule, legendRule, sillyRule } from './rule';

type P = { crew: Crew; a: After; setA: (fn: (x: After) => After) => void; update: Update };
type StepId = 'battle' | 'injuries' | 'advances' | 'break' | 'spend' | 'done';
const LABEL: Record<StepId, string> = { battle: 'The battle', injuries: 'Injuries and captives', advances: 'Advances', break: 'The break', spend: 'Spend', done: 'Done' };

const took = (crew: Crew, a: After) => crew.fighters.filter((f) => a.battle.fighters[f.id]?.inBattle);
const isDone = (a: After, s: StepId) => !!a.done?.[s];

export function AfterBattleView({ crew, update }: { crew: Crew; update: Update }) {
  const rules = getRules();
  useEffect(() => { document.title = `After the battle: ${crew.name || 'Crew'}`; }, [crew.name]);
  const a = crew.after;
  if (!a) return <div className="stack"><p className="empty">No battle to wrap up. Start one from the crew screen.</p><a className="btn" href={`#/crew/${crew.id}`}>Back to the crew</a></div>;
  const setA = (fn: (x: After) => After) => update((c) => (c.after ? { ...c, after: fn(c.after) } : c));

  // Only the steps that have something to do.
  const injured = took(crew, a).filter((f) => injuryTableFor(rules, a.battle, f.id, crew) || positionDef(rules, a.battle.fighters[f.id].position)?.captured);
  const due = crew.fighters.some((f) => advancesEarned(rules, f.xp) > f.advances.length);
  const steps: StepId[] = ['battle'];
  if (injured.length || a.tookCaptive || isDone(a, 'injuries')) steps.push('injuries');
  if (due || isDone(a, 'advances')) steps.push('advances');
  steps.push('break', 'spend', 'done');
  const cur: StepId = steps.includes(a.step as StepId) ? (a.step as StepId) : steps[0];
  const idx = steps.indexOf(cur);
  const goStep = (s: StepId) => { setA((x) => ({ ...x, step: s })); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const next = () => goStep(steps[Math.min(idx + 1, steps.length - 1)]);
  /** Record a step's changes, once, and move on. */
  const confirm = (s: StepId, changes: Change[]) => {
    update((c) => {
      if (!c.after || c.after.done?.[s]) return c;
      const { crew: nc, lines } = applyChanges(rules, c, changes);
      return { ...nc, after: { ...c.after, done: { ...(c.after.done ?? {}), [s]: lines } } };
    });
    next();
  };
  const props = { crew, a, setA, update, confirm, next };

  return (
    <div className="after">
      <div className="build-head">
        <div>
          <h1 className="crew-title">After the battle</h1>
          <p className="muted small">{crew.name}{a.battle.opponent ? ` vs ${a.battle.opponent}` : ''}</p>
        </div>
        <div className="parts"><span className="parts-num">{crew.parts}</span><span className="parts-label">parts</span></div>
      </div>
      <nav className="steps" aria-label="After-battle steps">
        <ol>{steps.map((s, i) => (
          <li key={s}><button className={`step ${s === cur ? 'on' : ''} ${isDone(a, s) ? 'done' : ''}`} aria-current={s === cur ? 'step' : undefined} onClick={() => goStep(s)}>
            <span className="step-n">{isDone(a, s) ? '✓' : i + 1}</span> {LABEL[s]}</button></li>
        ))}</ol>
      </nav>
      <section className="step-body">
        {cur === 'battle' && <BattleStep {...props} />}
        {cur === 'injuries' && <InjuriesStep {...props} />}
        {cur === 'advances' && <AdvancesStep {...props} />}
        {cur === 'break' && <BreakStep {...props} />}
        {cur === 'spend' && <SpendStep {...props} />}
        {cur === 'done' && <DoneStep {...props} />}
      </section>
      {idx > 0 && <div className="step-back"><button className="btn small" onClick={() => goStep(steps[idx - 1])}>← {LABEL[steps[idx - 1]]}</button></div>}
    </div>
  );
}

type SP = P & { confirm: (s: StepId, changes: Change[]) => void; next: () => void };

/** A step: its content, then "what this will record" and one button. Once confirmed, what it recorded. */
function Step({ id, a, crew, intro, changes, confirm, next, children, cta, blocked }: { id: StepId; a: After; crew: Crew; intro: ReactNode; changes: Change[]; confirm: SP['confirm']; next: () => void; children: ReactNode; cta?: string; blocked?: string }) {
  const done = a.done?.[id];
  return (
    <div className="stack">
      <h2>{LABEL[id]}</h2>
      <p className="muted">{intro}</p>
      <fieldset className="stack" disabled={!!done}>{children}</fieldset>
      <div className={`card summary ${done ? 'recorded' : ''}`}>
        {done ? (
          <>
            <h3>✓ Recorded</h3>
            {done.length ? <ul className="plain-list small">{done.map((l, i) => <li key={i}>{l}</li>)}</ul> : <p className="small muted">Nothing to record.</p>}
            <button className="btn primary" onClick={next}>Continue</button>
          </>
        ) : (
          <>
            <h3>This will record</h3>
            {changes.length ? <ul className="plain-list small">{changes.map((c, i) => <li key={i}>{describe(crew, c)}</li>)}</ul> : <p className="small muted">Nothing yet.</p>}
            {blocked && <p className="small err-text">{blocked}</p>}
            <button className="btn primary" disabled={!!blocked} onClick={() => confirm(id, changes)}>{cta ?? 'Confirm and continue'}</button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- tickable outcomes ----------
function Outcomes({ outcomes, picks, setPick, fighters, who, setWho }: {
  outcomes: Outcome[]; picks?: Record<string, boolean>; setPick: (k: string, v: boolean) => void;
  fighters?: Fighter[]; who?: Record<string, string>; setWho?: (k: string, fid: string) => void;
}) {
  if (!outcomes.length) return <p className="small muted">Nothing for the app to record here: apply it at the table, or add parts below.</p>;
  return (
    <div className="outcomes">
      {outcomes.map((o) => {
        const on = picks?.[o.key] ?? o.checked;
        return (
          <div key={o.key} className={`outcome ${on ? 'on' : ''}`}>
            <label className="check small"><input type="checkbox" checked={on} onChange={(e) => setPick(o.key, e.target.checked)} /> {o.label}</label>
            {o.needsFighter && on && fighters && setWho && (
              <select aria-label={`Who: ${o.label}`} value={who?.[o.key] ?? ''} onChange={(e) => setWho(o.key, e.target.value)}>
                <option value="">Which fighter?</option>{fighters.map((f) => <option key={f.id} value={f.id}>{fighterLabel(f)}</option>)}
              </select>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The changes of the ticked outcomes, with fighters filled in. */
function picked(outcomes: Outcome[], picks: Record<string, boolean> | undefined, who?: Record<string, string>): Change[] {
  return outcomes.filter((o) => picks?.[o.key] ?? o.checked).flatMap((o) => {
    if (!o.needsFighter) return [o.change];
    const fid = who?.[o.key];
    return fid ? [{ ...o.change, fid } as Change] : [];
  });
}

// ---------- 1. The battle: Words, XP, faction pay ----------
function BattleStep(p: SP) {
  const { crew, a, setA } = p;
  const rules = getRules();
  const b = a.battle;
  const fighters = took(crew, a);
  const fa = a.faction ?? { asks: {}, stars: {}, researchDone: !!b.research?.done, researchWho: null };
  const setFa = (x: Partial<typeof fa>) => setA((y) => ({ ...y, faction: { ...fa, ...x } }));
  const setWord = (fid: string, result: 'fulfilled' | 'failed') => setA((x) => ({ ...x, battle: { ...x.battle, fighters: { ...x.battle.fighters, [fid]: { ...x.battle.fighters[fid], word: { ...x.battle.fighters[fid].word!, result } } } } }));

  // XP, line by line.
  const lines: Record<string, { label: string; xp: number }[]> = Object.fromEntries(fighters.map((f) => [f.id, battleXp(rules, crew, b, f.id)]));
  const givers = fighters.filter((f) => putDownXpTarget(rules, crew, f) && b.fighters[f.id].putDowns > 0);
  const putDownXp = parseInt(rules.data.generic_xp.find((r) => plain(r.Deed).startsWith(rules.crew.afterBattle.genericXp.value.putDown))?.XP ?? '0', 10) || 0;
  const giveTo = (g: Fighter) => a.redirects?.[g.id] ?? fighters.find((f) => f.type === putDownXpTarget(rules, crew, g))?.id;
  for (const g of givers) {
    const to = giveTo(g);
    const n = Math.min(b.fighters[g.id].putDowns, rules.crew.battle.putDownXpMax.value);
    if (to && lines[to]) lines[to].push({ label: `${fighterLabel(g)}'s put-down`, xp: n * putDownXp });
  }
  const bonus = factionWordBonus(rules, crew, b);
  if (bonus && lines[bonus.fid]) lines[bonus.fid].push(bonus);
  const fr = factionAfterBattle(rules, crew, b, fa);
  for (const x of fr.xp) if (lines[x.fid]) lines[x.fid].push(x);
  const total = (id: string) => lines[id].reduce((s, l) => s + l.xp, 0) + (a.extraXp[id] ?? 0);

  // Words.
  const sworn = fighters.filter((f) => b.fighters[f.id].word);
  const changes: Change[] = [];
  for (const f of sworn) {
    const w = b.fighters[f.id].word!;
    if (w.result === 'fulfilled') {
      if (f.sillyTrait) changes.push({ kind: 'silly', fid: f.id, value: null });
      const l = legendFor(rules, w.deed);
      if (l) {
        changes.push({ kind: 'legend', fid: f.id, name: l.name, title: canTakeTitle(rules, crew, f) ? l.title : null });
        const to = a.spinOff?.[f.id];
        const sp = activeEffects(rules, crew, 'legend').find((e) => e.effect.kind === 'spinOffLegend');
        if (to && sp) changes.push({ kind: 'legend', fid: to, name: l.name, title: l.title ? `${sp.effect.prefix} ${l.title.replace(/^the /i, '')}` : null });
      }
    }
    if (w.result === 'failed') {
      const t = sillyTableFor(rules, w.deed);
      const n = a.sillyRolls?.[f.id];
      const s = t && n ? rules.silly.filter((x) => x.table === t)[n - 1] : null;
      if (s) changes.push({ kind: 'silly', fid: f.id, value: s.name });
    }
  }
  for (const f of fighters) if (total(f.id)) changes.push({ kind: 'xp', fid: f.id, amount: total(f.id), note: 'the battle' });
  for (const x of fr.parts) if (x.amount) changes.push({ kind: 'parts', amount: x.amount, note: x.label });
  const undecided = sworn.filter((f) => !b.fighters[f.id].word!.result).length;
  const sillyMissing = sworn.filter((f) => b.fighters[f.id].word!.result === 'failed' && !a.sillyRolls?.[f.id]).length;

  const asks = activeEffects(rules, crew, 'afterBattle').filter((e) => e.effect.ask);
  const rating = activeEffects(rules, crew, 'afterBattle').filter((e) => e.effect.kind === 'rating');
  const research = activeEffects(rules, crew, 'setup').find((e) => e.effect.kind === 'research');
  const reminders = activeEffects(rules, crew, 'afterBattle').filter((e) => e.effect.kind === 'reminder');
  const lp = leaguePoints(rules, b).filter((r) => r.count);

  return (
    <Step id="battle" {...p} intro="Count the Words and the XP (13.1). Check the numbers, answer any questions, and confirm." changes={changes}
      blocked={undecided ? `Say whether ${undecided === 1 ? 'the Word was' : `${undecided} Words were`} fulfilled.` : sillyMissing ? 'Roll the silly trait for each failed Word.' : undefined}>
      {sworn.length > 0 && (
        <div className="card stack-s">
          <h3>Words <span className="section-tag">§ 13.5</span></h3>
          {sworn.map((f) => {
            const w = b.fighters[f.id].word!;
            const deed = rules.deeds.find((d) => d.id === w.deed);
            const legend = legendFor(rules, w.deed);
            const table = sillyTableFor(rules, w.deed);
            const n = a.sillyRolls?.[f.id] ?? null;
            const silly = table && n ? rules.silly.filter((x) => x.table === table)[n - 1] : null;
            const sp = activeEffects(rules, crew, 'legend').find((e) => e.effect.kind === 'spinOffLegend');
            const rookies = sp ? crew.fighters.filter((x) => x.id !== f.id && x.xp < (sp.effect.xpBelow ?? 0)) : [];
            return (
              <div key={f.id} className="word-row stack-s">
                <div className="row gap-s wrap between">
                  <span><strong>{fighterLabel(f)}</strong>: {w.deed} {deed?.name} <span className="muted small">({w.audience})</span></span>
                  <span className="seg">
                    <button className={`seg-btn tight ${w.result === 'fulfilled' ? 'on' : ''}`} onClick={() => setWord(f.id, 'fulfilled')}>Fulfilled</button>
                    <button className={`seg-btn tight ${w.result === 'failed' ? 'on' : ''}`} onClick={() => setWord(f.id, 'failed')}>Failed</button>
                  </span>
                </div>
                {w.result === 'fulfilled' && legend && <p className="small">Earns the Legend <RuleLink rule={legendRule(rules, legend.name)}>{legend.name}</RuleLink>{legend.title ? ` ("${legend.title}")` : ''}.</p>}
                {w.result === 'fulfilled' && legend && sp && rookies.length > 0 && (
                  <FactionNote e={sp} small>
                    <select aria-label="Spin-off rookie" value={a.spinOff?.[f.id] ?? ''} onChange={(e) => setA((x) => ({ ...x, spinOff: { ...(x.spinOff ?? {}), [f.id]: e.target.value } }))}>
                      <option value="">No spin-off</option>{rookies.map((r) => <option key={r.id} value={r.id}>{fighterLabel(r)} ({r.xp} XP)</option>)}
                    </select>
                  </FactionNote>
                )}
                {w.result === 'failed' && table && (
                  <div className="row gap-s wrap">
                    <span className="small">Silly trait ({table}):</span>
                    <RollOrEnter die="d6" value={n} onResult={(v) => setA((x) => ({ ...x, sillyRolls: { ...(x.sillyRolls ?? {}), [f.id]: v } }))} />
                    {silly && <span className="small"><RuleLink rule={sillyRule(rules, silly.name)}>{silly.name}</RuleLink> ("{silly.title}")</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {(asks.length > 0 || rating.length > 0 || research || reminders.length > 0 || givers.length > 0) && (
        <div className="card stack-s">
          <h3>{crew.faction}</h3>
          {asks.map((e) => (
            <FactionNote key={e.effect.id} e={e} small>
              {e.effect.per === 'count'
                ? <label className="field inline-field"><span className="small">{e.effect.ask}</span><input type="number" min={0} className="num" value={Number(fa.asks[e.effect.id] ?? 0)} onChange={(ev) => setFa({ asks: { ...fa.asks, [e.effect.id]: +ev.target.value || 0 } })} /></label>
                : <label className="check small"><input type="checkbox" checked={!!fa.asks[e.effect.id]} onChange={(ev) => setFa({ asks: { ...fa.asks, [e.effect.id]: ev.target.checked } })} /> {e.effect.ask}{e.effect.kind === 'partsIf' && b.mark ? ` (the mark: ${b.mark})` : ''}</label>}
            </FactionNote>
          ))}
          {rating.map((e) => (
            <FactionNote key={e.effect.id} e={e} small>
              <div className="row gap-s wrap">{fighters.map((f) => (
                <label key={f.id} className="field inline-field"><span className="small">{fighterLabel(f)}</span>
                  <select value={fa.stars[f.id] ?? ''} onChange={(ev) => setFa({ stars: { ...fa.stars, [f.id]: +ev.target.value } })}>
                    <option value="">★?</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{'★'.repeat(n)}</option>)}
                  </select>
                </label>
              ))}</div>
            </FactionNote>
          ))}
          {research && (
            <FactionNote e={research} small>
              <label className="check small"><input type="checkbox" checked={fa.researchDone} onChange={(ev) => setFa({ researchDone: ev.target.checked })} /> Study completed</label>
              {fa.researchDone && (
                <select aria-label="Who gains the research XP" value={fa.researchWho ?? ''} onChange={(ev) => setFa({ researchWho: ev.target.value || null })}>
                  <option value="">Who gains +{research.effect.amount} XP?</option>
                  {researchEligible(rules, crew, b).map((f) => <option key={f.id} value={f.id}>{fighterLabel(f)} ({f.type})</option>)}
                </select>
              )}
            </FactionNote>
          )}
          {givers.map((g) => (
            <label key={g.id} className="field inline-field"><span className="small">{fighterLabel(g)}'s put-down XP goes to</span>
              <select value={giveTo(g) ?? ''} onChange={(ev) => setA((x) => ({ ...x, redirects: { ...(x.redirects ?? {}), [g.id]: ev.target.value } }))}>
                {fighters.filter((f) => f.type === putDownXpTarget(rules, crew, g)).map((f) => <option key={f.id} value={f.id}>{fighterLabel(f)}</option>)}
                {!fighters.some((f) => f.type === putDownXpTarget(rules, crew, g)) && <option value="">nobody: lost</option>}
              </select>
            </label>
          ))}
          {reminders.map((e) => <FactionNote key={e.effect.id} e={e} small />)}
          {fr.capped > 0 && <p className="small note">{fr.capped} parts over the faction pay cap of {rules.crew.factionPayCap.value} are lost ({rules.crew.factionPayCap.source}).</p>}
        </div>
      )}

      <div className="card">
        <h3>Experience <span className="section-tag">§ 13.4</span></h3>
        <ul className="plain-list xp-list">
          {fighters.map((f) => (
            <li key={f.id} className="xp-row">
              <div className="row between gap-s">
                <strong>{fighterLabel(f)}</strong>
                <span className="xp-total">+{total(f.id)} XP</span>
              </div>
              <div className="row gap-s wrap between">
                <span className="small muted">{lines[f.id].map((l) => `${l.label} +${l.xp}`).join(' · ') || b.fighters[f.id].position}</span>
                <label className="small inline-field">other <input type="number" className="num tiny" aria-label={`Other XP for ${fighterLabel(f)}`} value={a.extraXp[f.id] ?? 0} onChange={(e) => setA((x) => ({ ...x, extraXp: { ...x.extraXp, [f.id]: +e.target.value || 0 } }))} /></label>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="row gap wrap">
        <label className="check"><input type="checkbox" checked={!!a.tookCaptive} onChange={(e) => setA((x) => ({ ...x, tookCaptive: e.target.checked }))} /> We took a captive</label>
        <span className="small muted">League points: {lp.map((r) => `${r.label} ${r.points}`).join(', ') || 'none'} = <strong>{totalLeaguePoints(rules, b)}</strong></span>
      </div>
    </Step>
  );
}

// ---------- 2. Injuries and captives ----------
function InjuriesStep(p: SP) {
  const { crew, a, setA } = p;
  const rules = getRules();
  const b = a.battle;
  const rolling = took(crew, a).filter((f) => injuryTableFor(rules, b, f.id, crew));
  const captured = took(crew, a).filter((f) => positionDef(rules, b.fighters[f.id].position)?.captured);
  const setInj = (fid: string, x: Partial<After['injuries'][string]>) => setA((y) => ({ ...y, injuries: { ...y.injuries, [fid]: { ...(y.injuries[fid] ?? { rolls: [] }), ...x } } }));
  const changes: Change[] = [];
  const pending: string[] = [];
  for (const f of rolling) {
    const r = injuryState(rules, crew, a, f);
    if (!r.row) { pending.push(fighterLabel(f)); continue; }
    changes.push(...r.changes);
  }
  const taken = rules.crew.afterBattle.takenFate.value;
  for (const f of captured) {
    const r = a.ransom?.[f.id];
    if (r?.refuse) changes.push({ kind: 'leave', fid: f.id, fate: taken, note: b.opponent ? `Taken by ${b.opponent}` : '' });
    else if (r?.pay) changes.push({ kind: 'parts', amount: -r.pay, note: `Ransom for ${fighterLabel(f)}` });
  }
  const cap = a.captive ?? { income: null, roll: null, xpWho: null };
  const setCap = (x: Partial<typeof cap>) => setA((y) => ({ ...y, captive: { ...cap, ...x } }));
  const fates = activeEffects(rules, crew, 'captive');
  const fac = rules.faction(crew.faction ?? '');
  if (a.tookCaptive) {
    if (cap.income) changes.push({ kind: 'parts', amount: cap.income, note: 'Ransom or half price for a captive' });
    for (const e of fates) {
      if (e.effect.kind === 'rollOwnTaskTable' && cap.roll && fac) {
        const row = lookup(fac.ownTaskTable, cap.roll);
        if (row) changes.push(...picked(readOutcomes(rules, row.Result, { note: `Captive fate: ${plain(row.Result).split('.')[0]}` }), cap.picks));
      }
      if (e.effect.kind === 'captiveXp' && cap.xpWho) changes.push({ kind: 'xp', fid: cap.xpWho, amount: e.effect.amount ?? 0, note: e.title });
    }
  }
  return (
    <Step id="injuries" {...p} intro="Fighters who ended the battle down roll their injury table (13.2). Then captives are ransomed or meet their fate (14.4)." changes={changes}
      blocked={pending.length ? `Roll for ${pending.join(', ')}.` : undefined}>
      {rolling.map((f) => <InjuryCard key={f.id} crew={crew} f={f} a={a} setInj={(x) => setInj(f.id, x)} />)}
      {captured.map((f) => {
        const r = a.ransom?.[f.id] ?? { pay: null, refuse: false };
        const setR = (x: Partial<typeof r>) => setA((y) => ({ ...y, ransom: { ...(y.ransom ?? {}), [f.id]: { ...r, ...x } } }));
        return (
          <div key={f.id} className="card stack-s">
            <strong>{fighterLabel(f)} was captured</strong>
            <p className="small muted">The captor names a price from 10 to 10 + their Experience ({10 + f.xp}), at most 30. Pay it, or refuse and they are {taken}.</p>
            <div className="row gap-s wrap">
              <label className="field inline-field"><span className="small">Ransom paid</span><input className="num" inputMode="numeric" value={r.pay ?? ''} disabled={r.refuse} onChange={(e) => setR({ pay: +e.target.value.replace(/\D/g, '') || null })} /></label>
              <label className="check small"><input type="checkbox" checked={r.refuse} onChange={(e) => setR({ refuse: e.target.checked })} /> Refused: {taken}</label>
            </div>
          </div>
        );
      })}
      {a.tookCaptive && (
        <div className="card stack-s">
          <h3>Our captive</h3>
          <label className="field inline-field"><span className="small">Parts received (the ransom, or half the price if refused)</span><input className="num" inputMode="numeric" value={cap.income ?? ''} onChange={(e) => setCap({ income: +e.target.value.replace(/\D/g, '') || null })} /></label>
          {fates.map((e) => (
            <FactionNote key={e.effect.id} e={e} small>
              {e.effect.kind === 'rollOwnTaskTable' && fac && (() => {
                const row = cap.roll ? lookup(fac.ownTaskTable, cap.roll) : null;
                const outs = row ? readOutcomes(rules, row.Result, { note: 'Captive fate' }) : [];
                return (
                  <>
                    <RollOrEnter die="d6" value={cap.roll} onResult={(n) => setCap({ roll: n, picks: {} })} label="If refused: roll" />
                    {row && <p className="result small"><Md text={row.Result} /></p>}
                    {row && <Outcomes outcomes={outs} picks={cap.picks} setPick={(k, v) => setCap({ picks: { ...(cap.picks ?? {}), [k]: v } })} />}
                  </>
                );
              })()}
              {e.effect.kind === 'captiveXp' && (
                <select aria-label="Who gains the XP" value={cap.xpWho ?? ''} onChange={(ev) => setCap({ xpWho: ev.target.value || null })}>
                  <option value="">If refused: who gains +{e.effect.amount} XP?</option>
                  {(e.effect.who === 'bots' ? crew.fighters.filter((f) => isBot(rules, f)) : crew.fighters).map((f) => <option key={f.id} value={f.id}>{fighterLabel(f)}</option>)}
                </select>
              )}
            </FactionNote>
          ))}
        </div>
      )}
    </Step>
  );
}

/** One fighter's injury: the table, the roll(s), and what the result asks for. */
function injuryState(rules: ReturnType<typeof getRules>, crew: Crew, a: After, f: Fighter) {
  const t = injuryTableFor(rules, a.battle, f.id, crew)!;
  const st = a.injuries[f.id] ?? { rolls: [] };
  const roll = st.rolls.length >= t.times ? (t.times === 1 ? st.rolls[0] : st.chosen ?? null) : null;
  const row = roll !== null ? injuryResult(rules, t.table, roll) : undefined;
  const bot = isBot(rules, f);
  const actions = row ? injuryActions(rules, row.Result) : [];
  const changes: Change[] = [];
  let listRow: { name: string; title: string | null; text: string } | null = null;
  let listNote = '';
  const list = actions.find((x) => x.kind === 'injuryList');
  if (list) {
    const rows = bot ? rules.glitches : rules.injuries.filter((i) => i.table === list.value);
    const lr = st.listRolls ?? [];
    const pick = lr.length ? rows[lr[lr.length - 1] - 1] : null;
    const max = rules.crew.limits.maxLastingInjuries.value;
    if (f.injuries.length >= max) {
      const laid = rules.crew.campaign.statuses.value.find((s) => /laid/i.test(s));
      if (laid) changes.push({ kind: 'status', fid: f.id, value: laid });
      listNote = `Already ${max} lasting injuries: Laid up instead (13.2).`;
    } else if (pick && f.injuries.includes(pick.name)) listNote = `${pick.name}: they have it already. Roll again (13.2).`;
    else if (pick) { listRow = pick; changes.push({ kind: 'injury', fid: f.id, value: pick.name, title: canTakeTitleFor(rules, crew, f) ? pick.title : null }); }
  }
  const dead = actions.some((x) => x.kind === 'dead');
  if (dead) changes.push({ kind: 'leave', fid: f.id, fate: deathFate(rules, f), note: a.battle.opponent ? `After the battle against ${a.battle.opponent}` : 'After a battle' });
  const status = actions.find((x) => x.kind === 'status');
  if (status && !dead) changes.push({ kind: 'status', fid: f.id, value: status.value });
  const extra = row && !dead ? readOutcomes(rules, row.Result, { fid: f.id, note: `${fighterLabel(f)}: ${plain(row.Result).split('.')[0]}` }).filter((o) => o.change.kind !== 'status') : [];
  changes.push(...picked(extra, st.picks));
  return { t, st, row, roll, bot, actions, list, listRow, listNote, dead, status, extra, changes, needsList: !!list && !listRow && !listNote.startsWith('Already') };
}
const canTakeTitleFor = (rules: ReturnType<typeof getRules>, crew: Crew, f: Fighter) => canTakeTitle(rules, crew, f);

function InjuryCard({ crew, f, a, setInj }: { crew: Crew; f: Fighter; a: After; setInj: (x: Partial<After['injuries'][string]>) => void }) {
  const rules = getRules();
  const s = injuryState(rules, crew, a, f);
  const st = s.st;
  return (
    <div className="card stack-s">
      <div className="row between gap-s wrap">
        <strong>{fighterLabel(f)}</strong>
        <span className="small muted">{a.battle.fighters[f.id].position} · {s.t.table}{s.t.times > 1 ? ', twice: take the worse' : ''}</span>
      </div>
      {st.rolls.length < s.t.times && <RollOrEnter die="d66" onResult={(n) => setInj({ rolls: [...st.rolls, n] })} label={st.rolls.length ? 'Second roll' : 'Roll d66'} />}
      {st.rolls.length > 1 && (
        <div className="seg wrap">{st.rolls.map((r, i) => <button key={i} className={`seg-btn tight ${st.chosen === r ? 'on' : ''}`} onClick={() => setInj({ chosen: r })}>{r}: {plain(injuryResult(rules, s.t.table, r)?.Result ?? '').split('.')[0]}</button>)}</div>
      )}
      {s.row && (
        <p className="result"><strong>{s.roll}:</strong> <Md text={s.row.Result} />
          {s.bot && s.status && <span className="muted small"> (a bot: {botWord(rules, s.status.word ?? s.status.value)})</span>}
        </p>
      )}
      {s.list && (
        <div className="row gap-s wrap">
          <span className="small">{s.bot ? 'Glitch (13.3)' : `${s.list.value} lasting injury`}:</span>
          {!s.listNote.startsWith('Already') && <RollOrEnter die="d6" value={st.listRolls?.[st.listRolls.length - 1] ?? null} onResult={(n) => setInj({ listRolls: [...(st.listRolls ?? []), n] })} />}
          {s.listRow && <span className="small"><RuleLink rule={injuryRule(rules, s.listRow.name)}>{s.listRow.name}</RuleLink> ("{s.listRow.title}")</span>}
          {s.listNote && <span className="small err-text">{s.listNote}</span>}
        </div>
      )}
      {s.extra.length > 0 && <Outcomes outcomes={s.extra} picks={st.picks} setPick={(k, v) => setInj({ picks: { ...(st.picks ?? {}), [k]: v } })} />}
    </div>
  );
}

// ---------- 3. Advances ----------
function AdvancesStep({ crew, update, confirm }: SP) {
  const rules = getRules();
  const due = crew.fighters.filter((f) => advancesEarned(rules, f.xp) > f.advances.length);
  return (
    <div className="stack">
      <h2>Advances</h2>
      <p className="muted">A fighter who has crossed an XP threshold takes one advance (13.4). Choose it here; it goes on the card at once.</p>
      {due.length === 0 && <p className="ok-text">All advances taken.</p>}
      {due.map((f) => <div key={f.id} className="card"><h3>{fighterLabel(f)}</h3><Experience crew={crew} fighter={f} update={update} /></div>)}
      <button className="btn primary" onClick={() => confirm('advances', [])}>{due.length ? 'Take them later and continue' : 'Continue'}</button>
    </div>
  );
}

// ---------- 4. The break: air tax, story event, tasks ----------
function BreakStep(p: SP) {
  const { crew, a, setA } = p;
  const rules = getRules();
  const tax = airTax(rules, crew);
  const unpaid = a.taxUnpaid ?? [];
  const payers = tax.payers.filter((f) => !unpaid.includes(f.id));
  const taxAmount = payers.length * rules.crew.campaign.airTax.value;
  const changes: Change[] = [];
  if (taxAmount) changes.push({ kind: 'parts', amount: -taxAmount, note: `Air tax (${payers.length} fighters)` });

  // Story event.
  const story = a.story;
  const setStory = (x: Partial<After['story']>) => setA((y) => ({ ...y, story: { ...y.story, ...x } }));
  const keys = Object.keys(rules.data.story_events);
  const key = keys.find((k) => k.startsWith(`Row ${story.row}:`));
  const ev = key && story.roll ? lookup(rules.data.story_events[key], story.roll) : null;
  const twist = ev && ev.Twist !== 'None' ? splitTwist(ev.Twist) : null;
  const storyText = !ev ? '' : story.choice === 'Pay' ? ev.Pay : story.choice === 'Twist' && twist ? (story.twistOk === true ? twist.success : story.twistOk === false ? twist.failure : '') : story.choice === 'Accept' ? ev.Accept : '';
  const storyOuts = storyText ? readOutcomes(rules, storyText, { cost: story.choice === 'Pay' && /^\s*\d+ parts?:/.test(plain(storyText)), note: `Story: ${plain(ev!.Event).replace(/\.$/, '')}` }) : [];
  changes.push(...picked(storyOuts, story.picks, story.who));
  const hints = rowHints(rules, crew, a);

  // Tasks.
  const defs = taskDefs(rules, crew);
  const workers = crew.fighters.filter((f) => !taskBlocked(rules, f) && !unpaid.includes(f.id));
  for (const f of crew.fighters) {
    const t = a.tasks[f.id];
    const def = t && defs.find((d) => d.name === t.task);
    if (!t || !def || t.success === null) continue;
    const pay = t.success ? def.success : def.failure;
    const tp = taskPay(rules, crew, def.name, t.success, pay ? partsIn(pay) : null);
    if (tp.parts) changes.push({ kind: 'parts', amount: tp.parts, note: `${fighterLabel(f)}: ${def.name}` });
    if (tp.xp) changes.push({ kind: 'xp', fid: f.id, amount: tp.xp, note: def.name });
    const row = t.tableRoll ? lookup(def.table, t.tableRoll) : null;
    if (row) changes.push(...picked(readOutcomes(rules, row.Result, { fid: f.id, note: `${fighterLabel(f)}: ${plain(row.Result).split('.')[0]}` }), t.picks));
  }

  return (
    <Step id="break" {...p} intro="The air tax, one story event, and a downtime task for each fighter who may take one (14.1)." changes={changes}>
      <div className="card stack-s">
        <h3>Air tax <span className="section-tag">§ 14.3</span></h3>
        <p className="small">{rules.crew.campaign.airTax.value} parts a fighter; {rules.crew.campaign.airTax.exempt.join(', ')} fighters don't pay. Untick anyone you can't pay for: they take no task.</p>
        <div className="row gap-s wrap">{tax.payers.map((f) => (
          <label key={f.id} className="check small"><input type="checkbox" checked={!unpaid.includes(f.id)} onChange={(e) => setA((x) => ({ ...x, taxUnpaid: e.target.checked ? unpaid.filter((y) => y !== f.id) : [...unpaid, f.id] }))} /> {fighterLabel(f)}</label>
        ))}</div>
      </div>

      <div className="card stack-s">
        <h3>Story event <span className="section-tag">§ 14.5</span></h3>
        <div className="stack-s" role="radiogroup" aria-label="Story row">
          {rules.data.story_rows.map((r) => (
            <label key={r.Row} className={`option tight ${story.row === r.Row ? 'on' : ''}`}>
              <input type="radio" name="story-row" checked={story.row === r.Row} onChange={() => setStory({ row: r.Row, roll: null, choice: undefined, twistOk: null, picks: {} })} />
              <span className="small">{r.Row}. <Md text={r['Choose it when the crew...']} />{hints.includes(r.Row) && <span className="badge ok">fits</span>}</span>
            </label>
          ))}
        </div>
        {key && <RollOrEnter die="d6" value={story.roll} onResult={(n) => setStory({ roll: n, choice: undefined, twistOk: null, picks: {} })} />}
        {ev && (
          <div className="stack-s">
            <strong><Md text={ev.Event} /></strong>
            <div className="choices">
              {(['Accept', 'Pay', 'Twist'] as const).filter((c) => ev[c] !== 'None').map((c) => (
                <label key={c} className={`option tight ${story.choice === c ? 'on' : ''}`}>
                  <input type="radio" name="story-choice" checked={story.choice === c} onChange={() => setStory({ choice: c, picks: {}, twistOk: null })} />
                  <span className="small"><strong>{c}:</strong> <Md text={ev[c]} /></span>
                </label>
              ))}
            </div>
            {story.choice === 'Twist' && twist && (
              <TwistTest crew={crew} rating={twist.rating} who={story.twistWho ?? null} setWho={(w) => setStory({ twistWho: w })} ok={story.twistOk ?? null} setOk={(v) => setStory({ twistOk: v, picks: {} })} />
            )}
            {storyText && <Outcomes outcomes={storyOuts} picks={story.picks} setPick={(k, v) => setStory({ picks: { ...(story.picks ?? {}), [k]: v } })} fighters={crew.fighters} who={story.who} setWho={(k, fid) => setStory({ who: { ...(story.who ?? {}), [k]: fid } })} />}
          </div>
        )}
      </div>

      <div className="card stack-s">
        <h3>Downtime tasks <span className="section-tag">§ 14.6</span></h3>
        <p className="small muted">Choose a task, roll its test, then win or lose roll its table. Sore, Laid up, unpaid tax or hired this break: no task. Teaching Train takes the teacher's task too.</p>
        {crew.fighters.map((f) => <TaskRow key={f.id} crew={crew} f={f} a={a} setA={setA} defs={defs} blocked={!workers.includes(f)} />)}
      </div>
    </Step>
  );
}

function rowHints(rules: ReturnType<typeof getRules>, crew: Crew, a: After): string[] {
  const b = a.battle;
  const hints = rules.crew.afterBattle.storyRowHints.value;
  const lost = Object.values(a.injuries).some((i) => i.rolls.length) && crew.notes.roll.some((r) => /after the battle|taken by/i.test(r.note));
  const legend = Object.values(b.fighters).some((f) => f.word?.result === 'fulfilled' && rules.crew.battle.legendTiers.value.some((t) => rules.deeds.find((d) => d.id === f.word!.deed)?.tier.startsWith(t)));
  const facts: Record<string, boolean> = { heldField: b.heldField, notHeldField: !b.heldField, ran: !b.stoodGround, lostSomeone: lost, captive: !!a.tookCaptive || Object.values(a.ransom ?? {}).some((r) => r.pay), legend };
  return Object.entries(hints).filter(([, why]) => facts[why]).map(([row]) => row);
}

function TwistTest({ crew, rating, who, setWho, ok, setOk }: { crew: Crew; rating: string | null; who: string | null; setWho: (w: string | null) => void; ok: boolean | null; setOk: (v: boolean) => void }) {
  const rules = getRules();
  const f = crew.fighters.find((x) => x.id === who);
  const r = f && rating ? currentRatings(rules, f)[rating] ?? 0 : 0;
  const target = +(rules.data.difficulties[0]?.Target ?? 6);
  return (
    <div className="stack-s twist">
      <div className="row gap-s wrap">
        <span className="small">{rating ?? 'A'} test, Routine ({target}). Who tries?</span>
        <select aria-label="Who takes the test" value={who ?? ''} onChange={(e) => setWho(e.target.value || null)}>
          <option value="">Choose</option>{crew.fighters.map((x) => <option key={x.id} value={x.id}>{fighterLabel(x)}{rating ? ` (${rating} ${currentRatings(rules, x)[rating] ?? 0})` : ''}</option>)}
        </select>
      </div>
      {f && <PoolRoller key={f.id} initialExtra={r} target={target} onResult={(t) => setOk(t >= target)} />}
      <div className="seg"><button className={`seg-btn tight ${ok === true ? 'on' : ''}`} onClick={() => setOk(true)}>Passed</button><button className={`seg-btn tight ${ok === false ? 'on' : ''}`} onClick={() => setOk(false)}>Failed</button></div>
    </div>
  );
}

function TaskRow({ crew, f, a, setA, defs, blocked }: { crew: Crew; f: Fighter; a: After; setA: P['setA']; defs: ReturnType<typeof taskDefs>; blocked: boolean }) {
  const rules = getRules();
  const t = a.tasks[f.id] ?? { task: '', success: null, testTotal: null, tableRoll: null };
  const set = (x: Partial<typeof t>) => setA((y) => ({ ...y, tasks: { ...y.tasks, [f.id]: { ...t, ...x } } }));
  const def = defs.find((d) => d.name === t.task);
  const r = currentRatings(rules, f);
  if (blocked) return <div className="task-row muted small">{fighterLabel(f)}: no task this break{f.status !== rules.crew.campaign.statuses.value[0] ? ` (${f.status})` : ''}.</div>;
  const ratingUsed = def ? (def.ratings === 'any' ? t.rating ?? ratingNames(rules).find((n) => r[n] >= 1) ?? ratingNames(rules)[0] : def.ratings.length > 1 ? t.rating ?? def.ratings[0] : def.ratings[0]) : '';
  const pay = def && t.success !== null ? (t.success ? def.success : def.failure) : '';
  const tp = def && t.success !== null ? taskPay(rules, crew, def.name, t.success, pay ? partsIn(pay) : null) : null;
  const row = def && t.tableRoll ? lookup(def.table, t.tableRoll) : null;
  const outs = row ? readOutcomes(rules, row.Result, { fid: f.id, note: '' }) : [];
  return (
    <div className="task-row stack-s">
      <div className="row gap-s wrap between">
        <strong>{fighterLabel(f)}</strong>
        <select aria-label={`Task for ${fighterLabel(f)}`} value={t.task} onChange={(e) => set({ task: e.target.value, success: null, testTotal: null, tableRoll: null, picks: {} })}>
          <option value="">No task</option>{defs.map((d) => <option key={d.name} value={d.name}>{d.name}{d.own ? ' (faction)' : ''}</option>)}
        </select>
      </div>
      {def && (
        <>
          <p className="small muted">{plain(def.test)}. Success: {plain(def.success)}{def.failure ? `. Failure: ${plain(def.failure)}` : ''}</p>
          {(def.ratings === 'any' || def.ratings.length > 1) && (
            <select aria-label="Rating used" value={ratingUsed} onChange={(e) => set({ rating: e.target.value })}>{(def.ratings === 'any' ? ratingNames(rules) : def.ratings).map((n) => <option key={n} value={n}>{n} {r[n]}</option>)}</select>
          )}
          <PoolRoller key={`${def.name}-${ratingUsed}`} initialExtra={r[ratingUsed] ?? 0} target={def.target} label={`${ratingUsed} ${r[ratingUsed] ?? 0}`} onResult={(tot) => set({ testTotal: tot, success: def.target !== null ? tot >= def.target : null })} />
          <div className="seg"><button className={`seg-btn tight ${t.success === true ? 'on' : ''}`} onClick={() => set({ success: true })}>Success</button><button className={`seg-btn tight ${t.success === false ? 'on' : ''}`} onClick={() => set({ success: false })}>Failure</button></div>
          {tp && (tp.parts || tp.xp || tp.notes.length > 0) && <p className="small">Pay: {[tp.parts ? `${tp.parts} parts` : '', tp.xp ? `+${tp.xp} XP` : ''].filter(Boolean).join(', ') || 'nothing'}{tp.notes.length ? ` (${tp.notes.join(', ')})` : ''}</p>}
          {t.success !== null && def.table.length > 0 && (
            <>
              <RollOrEnter die={def.die === 'd6' ? 'd6' : '2d6'} value={t.tableRoll} onResult={(n) => set({ tableRoll: n, picks: {} })} label={`${def.name} table`} />
              {row && <p className="result small"><Md text={row.Result} /></p>}
              {row && <Outcomes outcomes={outs} picks={t.picks} setPick={(k, v) => set({ picks: { ...(t.picks ?? {}), [k]: v } })} />}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ---------- 5. Spend ----------
function SpendStep({ crew, update, confirm }: SP) {
  return (
    <div className="stack">
      <h2>Spend</h2>
      <p className="muted">Recharge, repair, buy, sell, hire and fit prosthetics (14.3, 11.3, 14.9). A new break: old stock needs a seller again.</p>
      <Stash crew={crew} update={update} />
      <details className="card"><summary>The shop</summary><Shop crew={crew} update={update} /></details>
      <details className="card"><summary>Hire a recruit</summary><Hire crew={crew} update={update} /></details>
      <button className="btn primary" onClick={() => confirm('spend', [])}>Done spending</button>
    </div>
  );
}

// ---------- 6. Done ----------
function DoneStep({ crew, a, setA, update }: SP) {
  const rules = getRules();
  const states = [...stateNames(rules), ...rules.crew.battle.positions.value.filter((x) => x.onTable && x.name !== rules.crew.battle.positions.value[0].name).map((x) => x.name)];
  const pts = totalLeaguePoints(rules, a.battle);
  const recap = useMemo(() => Object.entries(a.done ?? {}).flatMap(([s, lines]) => lines.map((l) => `${LABEL[s as StepId] ?? s}: ${l}`)), [a.done]);
  const finish = () => {
    update((c) => {
      const next: Crew = {
        ...c,
        fighters: c.fighters.map((f) => ({ ...f, word: '', history: a.history[f.id]?.trim() ? [...f.history, a.history[f.id].trim()] : f.history })),
        notes: { ...c.notes, season: [...c.notes.season, { id: uid('s'), battle: String(c.notes.season.length + 1), world: a.battle.world, opponent: a.battle.opponent, winCond: a.battle.winCond ? 'Met' : '', heldField: a.battle.heldField ? 'Yes' : 'No', story: a.story.notes || (a.story.row ? `Row ${a.story.row}, ${a.story.roll ?? ''}${a.story.choice ? `, ${a.story.choice}` : ''}` : ''), points: pts }] },
      };
      return finishAfterBattle(next);
    });
    go(`/crew/${crew.id}`);
  };
  const cancel = activeEffects(rules, crew, 'break').filter((e) => e.effect.kind === 'cancelFighter' && !(e.effect.condition === 'notHeldField' && a.battle.heldField));
  return (
    <div className="stack">
      <h2>Done</h2>
      <p className="muted">One line of History for each fighter (13.1), and the season log: {a.battle.opponent || 'this battle'}, <strong>{pts} league points</strong>.</p>
      {crew.fighters.map((f) => (
        <div key={f.id} className="card stack-s">
          <div className="row between gap-s wrap"><strong>{fighterLabel(f)}</strong><span className="small muted">{f.status} · {f.xp} XP{f.nextBattle?.length ? ` · starts next battle ${f.nextBattle.join(', ')}` : ''}</span></div>
          <input aria-label={`History for ${fighterLabel(f)}`} placeholder="One line of History" value={a.history[f.id] ?? ''} onChange={(e) => setA((x) => ({ ...x, history: { ...x.history, [f.id]: e.target.value } }))} />
          <details><summary className="small">Starts the next battle with…</summary>
            <div className="seg wrap">{states.map((s) => {
              const on = (f.nextBattle ?? []).includes(s);
              return <button key={s} className={`seg-btn tight ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => update((c) => ({ ...c, fighters: c.fighters.map((x) => (x.id === f.id ? { ...x, nextBattle: on ? (x.nextBattle ?? []).filter((y) => y !== s) : [...(x.nextBattle ?? []), s] } : x)) }))}>{s}</button>;
            })}</div>
          </details>
        </div>
      ))}
      {cancel.map((e) => <CancelFighter key={e.effect.id} crew={crew} e={e} a={a} setA={setA} update={update} />)}
      {recap.length > 0 && (
        <details className="card" open>
          <summary>What this break recorded ({recap.length})</summary>
          <ul className="plain-list small">{recap.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </details>
      )}
      <button className="btn primary" onClick={finish}>Finish the break</button>
    </div>
  );
}

/** Remove a fighter and gain their hire price (Streaming Platforms, 12.7). */
function CancelFighter({ crew, e, a, setA, update }: { crew: Crew; e: ActiveEffect; a: After; setA: P['setA']; update: Update }) {
  const rules = getRules();
  const ask = useAsk();
  const [who, setWho] = useState('');
  if (a.cancelled) return <span className="badge ok">A fighter was cancelled</span>;
  const f = crew.fighters.find((x) => x.id === who);
  const price = f ? hirePrice(rules, crew, f) : 0;
  return (
    <FactionNote e={e} small>
      <div className="row gap-s wrap">
        <select aria-label="Fighter to cancel" value={who} onChange={(ev) => setWho(ev.target.value)}>
          <option value="">Cancel nobody</option>{crew.fighters.map((x) => <option key={x.id} value={x.id}>{fighterLabel(x)} ({hirePrice(rules, crew, x)} parts)</option>)}
        </select>
        <button className="btn small danger" disabled={!f} onClick={async () => {
          if (!f || !(await ask({ message: `Cancel ${fighterLabel(f)}? They leave the roster and the crew gains ${price} parts. Their gear returns to the stash.`, ok: 'Cancel them', danger: true }))) return;
          update((c) => applyChanges(rules, c, [{ kind: 'leave', fid: f.id, fate: e.title, note: 'Cancelled' }, { kind: 'parts', amount: price, note: `${e.title}: ${fighterLabel(f)} cancelled` }]).crew);
          setA((x) => ({ ...x, cancelled: true }));
        }}>Cancel them for {price} parts</button>
      </div>
    </FactionNote>
  );
}

