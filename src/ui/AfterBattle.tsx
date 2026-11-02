// After the battle and the break, in the book's order (13.1, 14.1), as a few
// short steps. Each step shows what it will record and records it on one tap.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { getRules, plain } from '../data/rules';
import {
  battleXp, botWord, finishAfterBattle, injuryResult, injuryTableFor, leaguePoints, legendFor, positionDef,
  sillyTableFor, stateNames, taskBlocked, taskDefs, totalLeaguePoints,
} from '../engine/battle';
import {
  activeEffects, canTakeTitle, factionAfterBattle, factionWordBonus, putDownXpTarget, researchEligible, taskPay, type ActiveEffect,
} from '../engine/faction';
import { advancesEarned, airTax, currentRatings, hirePrice, isBot, ratingNames } from '../engine/crew';
import { lookup } from '../engine/dice';
import { applyChanges, describe, setItemNamer, splitTwist, type Change } from '../engine/outcomes';
import { resolveEffects, type EffCtx, type EffState, type Node, type Resolved } from '../engine/effects';
import { uid, type AfterBattle as After, type Crew, type Fighter } from '../engine/model';
import { go } from '../App';
import { Hire, Md, Shop, Stash, fighterLabel, type Update } from './common';
import { Experience } from './Campaign';
import { PoolRoller, RollOrEnter } from './Dice';
import { FactionNote } from './Battle';
import { useAsk } from './confirm';

setItemNamer((id) => getRules().item(id)?.name ?? id.split('|')[0]);
import { RuleLink, legendRule, sillyRule } from './rule';

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
  const st = a.eff ?? {};
  const setSt = (path: string, v: unknown) => setA((x) => ({ ...x, eff: { ...(x.eff ?? {}), [path]: v } }));
  const changes: Change[] = [];
  const missing: string[] = [];
  const cards = rolling.map((f) => {
    const r = injuryResolve(rules, crew, a, f);
    changes.push(...r.res.changes);
    if (!r.row) missing.push(`roll for ${fighterLabel(f)}`);
    else missing.push(...r.res.missing.map((m) => `${fighterLabel(f)}: ${m}`));
    return { f, r };
  });
  const taken = rules.crew.afterBattle.takenFate.value;
  for (const f of captured) {
    const r = a.ransom?.[f.id];
    if (r?.refuse) changes.push({ kind: 'leave', fid: f.id, fate: taken, note: b.opponent ? `Taken by ${b.opponent}` : '' });
    else if (r?.pay) changes.push({ kind: 'parts', amount: -r.pay, note: `Ransom for ${fighterLabel(f)}` });
  }
  const cap = a.captive ?? { income: null, roll: null, xpWho: null };
  const setCap = (x: Partial<typeof cap>) => setA((y) => ({ ...y, captive: { ...cap, ...x } }));
  const fates = activeEffects(rules, crew, 'captive');
  const own = rules.outcomes.ownTasks[crew.faction ?? ''];
  const fac = rules.faction(crew.faction ?? '');
  const fateRes = a.tookCaptive && cap.roll && own ? resolveEffects(rules, crew, own.table[String(cap.roll)] ?? [], { note: 'Captive fate', battle: b }, st, 'captive') : null;
  if (a.tookCaptive) {
    if (cap.income) changes.push({ kind: 'parts', amount: cap.income, note: 'Ransom or half price for a captive' });
    if (fateRes) { changes.push(...fateRes.changes); missing.push(...fateRes.missing); }
    for (const e of fates) if (e.effect.kind === 'captiveXp' && cap.xpWho) changes.push({ kind: 'xp', fid: cap.xpWho, amount: e.effect.amount ?? 0, note: e.title });
  }
  return (
    <Step id="injuries" {...p} intro="Fighters who ended the battle down roll their injury table (13.2). Then captives are ransomed or meet their fate (14.4)." changes={changes}
      blocked={missing.length ? `Still to do: ${missing.join('; ')}.` : undefined}>
      {cards.map(({ f, r }) => (
        <div key={f.id} className="card stack-s">
          <div className="row between gap-s wrap">
            <strong>{fighterLabel(f)}</strong>
            <span className="small muted">{b.fighters[f.id].position} · {r.t.table}{r.t.times > 1 ? ', twice: take the worse' : ''}{isBot(rules, f) ? ' · bot words and glitches (13.3)' : ''}</span>
          </div>
          {r.rolls.length < r.t.times && <RollOrEnter die="d66" onResult={(n) => setSt(`inj:${f.id}`, [...r.rolls, n])} label={r.rolls.length ? 'Second roll' : 'Roll d66'} />}
          {r.rolls.length > 1 && (
            <div className="seg wrap">{r.rolls.map((n, k) => <button key={k} className={`seg-btn tight ${r.chosen === k ? 'on' : ''}`} onClick={() => setSt(`inj:${f.id}.c`, k)}>{n}: {plain(injuryResult(rules, r.t.table, n)?.Result ?? '').split('.')[0]}</button>)}</div>
          )}
          {r.row && <p className="result"><strong>{r.roll}:</strong> <Md text={r.row.Result} /></p>}
          {r.row && <EffectNodes nodes={r.res.nodes} st={st} set={setSt} crew={crew} botWords={isBot(rules, f)} />}
        </div>
      ))}
      {captured.map((f) => {
        const r = a.ransom?.[f.id] ?? { pay: null, refuse: false };
        const setR = (x: Partial<typeof r>) => setA((y) => ({ ...y, ransom: { ...(y.ransom ?? {}), [f.id]: { ...r, ...x } } }));
        return (
          <div key={f.id} className="card stack-s">
            <strong>{fighterLabel(f)} was captured</strong>
            <p className="small muted">The captor names a price from 10 to 10 + their Experience ({Math.min(30, 10 + f.xp)}), at most 30. Pay it, or refuse and they are {taken}.</p>
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
              {e.effect.kind === 'rollOwnTaskTable' && fac && (
                <>
                  <RollOrEnter die="d6" value={cap.roll} onResult={(n) => setCap({ roll: n })} label="If refused: roll" />
                  {cap.roll && <p className="result small"><Md text={lookup(fac.ownTaskTable, cap.roll)?.Result ?? ''} /></p>}
                  {fateRes && <EffectNodes nodes={fateRes.nodes} st={st} set={setSt} crew={crew} />}
                </>
              )}
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

/** One fighter's injury roll(s), the row, and its effects. */
function injuryResolve(rules: ReturnType<typeof getRules>, crew: Crew, a: After, f: Fighter) {
  const t = injuryTableFor(rules, a.battle, f.id, crew)!;
  const st = a.eff ?? {};
  const rolls = (st[`inj:${f.id}`] as number[]) ?? [];
  const chosen = st[`inj:${f.id}.c`] as number | undefined;
  const roll = rolls.length >= t.times ? (t.times === 1 ? rolls[0] : chosen !== undefined ? rolls[chosen] : null) : null;
  const row = roll !== null ? injuryResult(rules, t.table, roll) : undefined;
  const effs = row ? rules.outcomes.injuryTables[t.table]?.[row.d66] ?? [] : [];
  const res = resolveEffects(rules, crew, effs, { self: f.id, battle: a.battle, injuryTable: t.table, note: `${fighterLabel(f)}: ${row ? plain(row.Result).split('.')[0] : ''}` }, st, `inj:${f.id}:e`);
  return { t, rolls, chosen, roll, row, res };
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
  const st = a.eff ?? {};
  const setSt = (path: string, v: unknown) => setA((x) => ({ ...x, eff: { ...(x.eff ?? {}), [path]: v } }));
  const tax = airTax(rules, crew);
  const unpaid = a.taxUnpaid ?? [];
  const payers = tax.payers.filter((f) => !unpaid.includes(f.id));
  const taxAmount = payers.length * rules.crew.campaign.airTax.value;
  const changes: Change[] = [];
  const missing: string[] = [];
  if (taxAmount) changes.push({ kind: 'parts', amount: -taxAmount, note: `Air tax (${payers.length} fighters)` });

  // Story event.
  const story = a.story;
  const setStory = (x: Partial<After['story']>) => setA((y) => ({ ...y, story: { ...y.story, ...x } }));
  const key = Object.keys(rules.data.story_events).find((k) => k.startsWith(`Row ${story.row}:`));
  const ev = key && story.roll ? lookup(rules.data.story_events[key], story.roll) : null;
  const evO = key && story.roll ? rules.outcomes.storyEvents[key]?.[String(story.roll)] : undefined;
  const twist = ev && ev.Twist !== 'None' ? splitTwist(ev.Twist) : null;
  const storyEffs = !evO ? [] : story.choice === 'Pay' ? evO.pay ?? [] : story.choice === 'Twist' ? (story.twistOk === true ? evO.twist?.success ?? [] : story.twistOk === false ? evO.twist?.failure ?? [] : []) : story.choice === 'Accept' ? evO.accept : [];
  const storyRes = resolveEffects(rules, crew, storyEffs, { battle: a.battle, note: ev ? `Story: ${plain(ev.Event).replace(/\.$/, '')}` : '' }, st, `story:${story.row}.${story.roll}.${story.choice}.${story.twistOk}`);
  changes.push(...storyRes.changes);
  if (ev && !story.choice) missing.push('choose Accept, Pay or Twist');
  if (story.choice === 'Twist' && story.twistOk == null) missing.push('make the twist test');
  if (!story.roll) missing.push('roll the story event');
  missing.push(...storyRes.missing.map((m) => `story: ${m}`));
  const hints = rowHints(rules, crew, a);

  // Tasks.
  const defs = taskDefs(rules, crew);
  const blocked = new Set<string>([...storyRes.noTask, ...unpaid]);
  const teachers = new Set(Object.values(a.tasks).map((t) => t.teacher).filter(Boolean) as string[]);
  const results = crew.fighters.map((f) => {
    const off = storyRes.noTasks || blocked.has(f.id) || taskBlocked(rules, f) || teachers.has(f.id);
    const t = a.tasks[f.id];
    if (off || !t?.task) return { f, off, r: null };
    const r = taskResolve(rules, crew, a, f, t, defs, st);
    changes.push(...r.changes);
    missing.push(...r.missing.map((m) => `${fighterLabel(f)}: ${m}`));
    return { f, off, r };
  });

  return (
    <Step id="break" {...p} intro="The air tax, one story event, and a downtime task for each fighter who may take one (14.1)." changes={changes}
      blocked={missing.length ? `Still to do: ${missing.join('; ')}.` : undefined}>
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
              <input type="radio" name="story-row" checked={story.row === r.Row} onChange={() => setStory({ row: r.Row, roll: null, choice: undefined, twistOk: null })} />
              <span className="small">{r.Row}. <Md text={r['Choose it when the crew...']} />{hints.includes(r.Row) && <span className="badge ok">fits</span>}</span>
            </label>
          ))}
        </div>
        {key && <RollOrEnter die="d6" value={story.roll} onResult={(n) => setStory({ roll: n, choice: undefined, twistOk: null })} />}
        {ev && (
          <div className="stack-s">
            <strong><Md text={ev.Event} /></strong>
            <div className="choices">
              {(['Accept', 'Pay', 'Twist'] as const).filter((c) => ev[c] !== 'None').map((c) => (
                <label key={c} className={`option tight ${story.choice === c ? 'on' : ''}`}>
                  <input type="radio" name="story-choice" checked={story.choice === c} onChange={() => setStory({ choice: c, twistOk: null })} />
                  <span className="small"><strong>{c}:</strong> <Md text={ev[c]} /></span>
                </label>
              ))}
            </div>
            {story.choice === 'Twist' && twist && (
              <TwistTest crew={crew} rating={twist.rating} who={story.twistWho ?? null} setWho={(w) => setStory({ twistWho: w })} ok={story.twistOk ?? null} setOk={(v) => setStory({ twistOk: v })} />
            )}
            {story.choice && <EffectNodes nodes={storyRes.nodes} st={st} set={setSt} crew={crew} empty="Nothing happens." />}
          </div>
        )}
      </div>

      <div className="card stack-s">
        <h3>Downtime tasks <span className="section-tag">§ 14.6</span></h3>
        <p className="small muted">Choose a task, roll its test, then win or lose roll its table. Sore, Laid up, unpaid tax, teaching, or a story event that says so: no task.</p>
        {results.map(({ f, off, r }) => <TaskRow key={f.id} crew={crew} f={f} a={a} setA={setA} defs={defs} off={off} r={r} st={st} setSt={setSt} />)}
      </div>
    </Step>
  );
}

type TaskState = After['tasks'][string];

/** A task: its test, its pay (after faction rules and the table), and its table row's effects. */
function taskResolve(rules: ReturnType<typeof getRules>, crew: Crew, a: After, f: Fighter, t: TaskState, defs: ReturnType<typeof taskDefs>, st: EffState) {
  const def = defs.find((d) => d.name === t.task);
  const out = { def, changes: [] as Change[], missing: [] as string[], table: null as Resolved | null, base: null as Resolved | null, row: null as Record<string, string> | null, pay: '' };
  if (!def) return out;
  const base = def.own ? rules.outcomes.ownTasks[crew.faction ?? ''] : rules.outcomes.taskBase[def.name];
  const needs = def.own ? undefined : rules.outcomes.taskBase[def.name]?.needs;
  if (needs === 'patient' && !t.patient) out.missing.push('choose the patient');
  if (needs === 'teacher' && !t.teacher) out.missing.push('choose the teacher');
  if (t.success == null) { out.missing.push('roll the test'); return out; }
  const ctx: EffCtx = { self: f.id, patient: t.patient ?? null, teacher: t.teacher ?? null, battle: a.battle, note: `${fighterLabel(f)}: ${def.name}` };
  // The table row first: it can change the task's pay or stop the finds roll.
  if (def.table.length) {
    if (!t.tableRoll) out.missing.push(`roll the ${def.name} table`);
    else {
      const row = lookup(def.table, t.tableRoll);
      out.row = row ?? null;
      const effs = row ? (def.own ? rules.outcomes.ownTasks[crew.faction ?? '']?.table[row.d6] : rules.outcomes.taskTables[def.name]?.[row['2d6']]) ?? [] : [];
      out.table = resolveEffects(rules, crew, effs, { ...ctx, note: `${fighterLabel(f)}: ${row ? plain(row.Result).split('.')[0] : ''}` }, st, `task:${f.id}:${def.name}:${t.tableRoll}`);
    }
  }
  const mult = out.table?.taskPay;
  const useFailure = mult === 'failure' || (!t.success);
  let baseEffs = (useFailure ? base?.failure : base?.success) ?? [];
  if (out.table?.noFinds) baseEffs = baseEffs.filter((e) => !e.finds);
  out.base = resolveEffects(rules, crew, baseEffs, ctx, st, `taskbase:${f.id}:${def.name}:${useFailure}`);
  // Faction rules, captain traits and tags change the pay (12.5, 11.2, 14.10); the table can halve, double or cancel it.
  const baseParts = out.base.changes.filter((c) => c.kind === 'parts').reduce((s, c) => s + (c as { amount: number }).amount, 0);
  const tp = taskPay(rules, crew, def.name, !!t.success && mult !== 'failure', baseParts || null);
  let parts = tp.parts ?? 0;
  if (typeof mult === 'number') parts = mult === 2 && !t.success ? parts : Math.floor(parts * mult);
  out.changes.push(...out.base.changes.filter((c) => c.kind !== 'parts'));
  if (parts) out.changes.push({ kind: 'parts', amount: parts, note: `${fighterLabel(f)}: ${def.name}` });
  if (tp.xp) out.changes.push({ kind: 'xp', fid: f.id, amount: tp.xp, note: def.name });
  out.pay = [parts ? `${parts} parts` : '', tp.xp ? `+${tp.xp} XP` : '', ...tp.notes].filter(Boolean).join(', ');
  out.missing.push(...out.base.missing);
  if (out.table) { out.changes.push(...out.table.changes); out.missing.push(...out.table.missing); }
  return out;
}

function TaskRow({ crew, f, a, setA, defs, off, r, st, setSt }: { crew: Crew; f: Fighter; a: After; setA: P['setA']; defs: ReturnType<typeof taskDefs>; off: boolean; r: ReturnType<typeof taskResolve> | null; st: EffState; setSt: (p: string, v: unknown) => void }) {
  const rules = getRules();
  const t: TaskState = a.tasks[f.id] ?? { task: '', success: null, testTotal: null, tableRoll: null };
  const set = (x: Partial<TaskState>) => setA((y) => ({ ...y, tasks: { ...y.tasks, [f.id]: { ...t, ...x } } }));
  const def = defs.find((d) => d.name === t.task);
  const rt = currentRatings(rules, f);
  if (off) return <div className="task-row muted small">{fighterLabel(f)}: no task this break{f.status !== rules.crew.campaign.statuses.value[0] ? ` (${f.status})` : ''}.</div>;
  const ratingUsed = def ? (def.ratings === 'any' ? t.rating ?? ratingNames(rules).find((n) => rt[n] >= 1) ?? ratingNames(rules)[0] : def.ratings.length > 1 ? t.rating ?? def.ratings[0] : def.ratings[0]) : '';
  const needs = def && !def.own ? rules.outcomes.taskBase[def.name]?.needs : undefined;
  const laid = rules.crew.campaign.statuses.value.find((x) => /laid/i.test(x));
  const patients = crew.fighters.filter((x) => x.id !== f.id && x.status === laid);
  const teachers = crew.fighters.filter((x) => x.id !== f.id && (currentRatings(rules, x)[ratingUsed] ?? 0) > (rt[ratingUsed] ?? 0));
  return (
    <div className="task-row stack-s">
      <div className="row gap-s wrap between">
        <strong>{fighterLabel(f)}</strong>
        <select aria-label={`Task for ${fighterLabel(f)}`} value={t.task} onChange={(e) => set({ task: e.target.value, success: null, testTotal: null, tableRoll: null, patient: null, teacher: null })}>
          <option value="">No task</option>{defs.map((d) => <option key={d.name} value={d.name}>{d.name}{d.own ? ' (faction)' : ''}</option>)}
        </select>
      </div>
      {def && (
        <>
          <p className="small muted">{plain(def.test)}. Success: {plain(def.success)}{def.failure ? `. Failure: ${plain(def.failure)}` : ''}</p>
          {(def.ratings === 'any' || def.ratings.length > 1) && (
            <select aria-label="Rating used" value={ratingUsed} onChange={(e) => set({ rating: e.target.value, teacher: null })}>{(def.ratings === 'any' ? ratingNames(rules) : def.ratings).map((n) => <option key={n} value={n}>{n} {rt[n]}</option>)}</select>
          )}
          {needs === 'patient' && (patients.length
            ? <select aria-label="Patient" value={t.patient ?? ''} onChange={(e) => set({ patient: e.target.value || null })}><option value="">Who is nursed? (Laid up)</option>{patients.map((x) => <option key={x.id} value={x.id}>{fighterLabel(x)}</option>)}</select>
            : <p className="small err-text">Nobody is Laid up: this task can't be taken.</p>)}
          {needs === 'teacher' && (teachers.length
            ? <select aria-label="Teacher" value={t.teacher ?? ''} onChange={(e) => set({ teacher: e.target.value || null })}><option value="">Who teaches? (higher {ratingUsed})</option>{teachers.map((x) => <option key={x.id} value={x.id}>{fighterLabel(x)} ({ratingUsed} {currentRatings(rules, x)[ratingUsed]})</option>)}</select>
            : <p className="small err-text">Nobody has a higher {ratingUsed} to teach them.</p>)}
          <PoolRoller key={`${def.name}-${ratingUsed}`} initialExtra={rt[ratingUsed] ?? 0} target={def.target} label={`${ratingUsed} ${rt[ratingUsed] ?? 0}`} onResult={(tot) => set({ testTotal: tot, success: def.target !== null ? tot >= def.target : null })} />
          <div className="seg"><button className={`seg-btn tight ${t.success === true ? 'on' : ''}`} onClick={() => set({ success: true })}>Success</button><button className={`seg-btn tight ${t.success === false ? 'on' : ''}`} onClick={() => set({ success: false })}>Failure</button></div>
          {r?.base && <EffectNodes nodes={r.base.nodes.filter((n) => !(n.kind === 'auto' && /parts$/.test(n.text)))} st={st} set={setSt} crew={crew} />}
          {t.success != null && <p className="small">Pay: <strong>{r?.pay || 'nothing'}</strong></p>}
          {t.success != null && def.table.length > 0 && (
            <>
              <RollOrEnter die={def.die === 'd6' ? 'd6' : '2d6'} value={t.tableRoll} onResult={(n) => set({ tableRoll: n })} label={`${def.name} table`} />
              {r?.row && <p className="result small"><Md text={r.row.Result} /></p>}
              {r?.table && <EffectNodes nodes={r.table.nodes} st={st} set={setSt} crew={crew} />}
            </>
          )}
        </>
      )}
    </div>
  );
}

function rowHints(rules: ReturnType<typeof getRules>, crew: Crew, a: After): string[] {
  const b = a.battle;
  const hints = rules.crew.afterBattle.storyRowHints.value;
  const lost = (a.done?.injuries ?? []).some((l) => /: (Dead|Destroyed|Taken)/.test(l)) || Object.values(a.ransom ?? {}).some((r) => r.refuse);
  const legend = Object.values(b.fighters).some((f) => f.word?.result === 'fulfilled' && rules.crew.battle.legendTiers.value.some((t) => rules.deeds.find((d) => d.id === f.word!.deed)?.tier.startsWith(t)));
  const facts: Record<string, boolean> = { heldField: b.heldField, notHeldField: !b.heldField, ran: !b.stoodGround, lostSomeone: lost, captive: !!a.tookCaptive || Object.values(a.ransom ?? {}).some((r) => r.pay), legend };
  void crew;
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

// ---------- the effects of a table row: shown, and decided ----------
function EffectNodes({ nodes, st, set, crew, empty, botWords }: { nodes: Node[]; st: EffState; set: (p: string, v: unknown) => void; crew: Crew; empty?: string; botWords?: boolean }) {
  const rules = getRules();
  if (!nodes.length) return empty ? <p className="small muted">{empty}</p> : null;
  const shown = (t: string) => (botWords ? t.replace(/\b(is|are) (\w[\w ]*)$/, (_m, v, w) => `${v} ${botWord(rules, w)}`) : t);
  return (
    <ul className="effects plain-list">
      {nodes.map((n) => {
        switch (n.kind) {
          case 'auto': return <li key={n.path + n.text} className="eff auto">✓ {shown(n.text)}</li>;
          case 'note': return <li key={n.path + n.text} className="eff note-eff">ⓘ {n.text}</li>;
          case 'select': {
            const vals = n.value ? n.value.split(',') : [];
            if (n.multi && n.multi > 1) return (
              <li key={n.path} className="eff ask"><span className="small">{n.label} ({n.multi})</span>
                <div className="row gap-s wrap">{n.options.map((o) => (
                  <label key={o.value} className="check small"><input type="checkbox" checked={vals.includes(o.value)} onChange={(e) => set(n.path, e.target.checked ? [...vals, o.value] : vals.filter((x) => x !== o.value))} /> {o.label}</label>
                ))}</div>
              </li>
            );
            return (
              <li key={n.path} className="eff ask">
                <select aria-label={n.label} value={n.value} onChange={(e) => set(n.path, e.target.value)}>
                  <option value="">{n.label}</option>{n.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </li>
            );
          }
          case 'text': return <li key={n.path} className="eff ask"><input aria-label={n.label} placeholder={`${n.label}: ${n.placeholder ?? ''}`} value={n.value} onChange={(e) => set(n.path, e.target.value)} /></li>;
          case 'choice': return (
            <li key={n.path} className="eff ask"><div className="choices">{n.options.map((o, k) => (
              <label key={k} className={`option tight ${n.value === k ? 'on' : ''}`}><input type="radio" name={n.path} checked={n.value === k} onChange={() => set(n.path, k)} /> <span className="small">{o}</span></label>
            ))}</div></li>
          );
          case 'roll': return (
            <li key={n.path} className="eff ask stack-s">
              <span className="small">{n.label}{n.rolls.length ? `: ${n.rolls.join(', ')}` : ''}</span>
              {n.rolls.length < n.times && <RollOrEnter die={n.die} onResult={(v) => set(n.path, [...n.rolls, v])} />}
              {n.pick && <div className="choices">{n.pick.labels.map((l, k) => (
                <label key={k} className={`option tight ${n.pick!.value === k ? 'on' : ''}`}><input type="radio" name={n.pick!.path} checked={n.pick!.value === k} onChange={() => set(n.pick!.path, k)} /> <span className="small">{l}</span></label>
              ))}</div>}
              {n.rolls.length > 0 && <button className="link small" onClick={() => { set(n.path, []); if (n.pick) set(n.pick.path, undefined); }}>Roll again from the start</button>}
            </li>
          );
          case 'test': {
            const f = crew.fighters.find((x) => x.id === n.fid);
            const r = f ? currentRatings(rules, f)[n.rating] ?? 0 : 0;
            return (
              <li key={n.path} className="eff ask stack-s">
                <span className="small">{n.label}{f ? ` for ${fighterLabel(f)}` : ''}</span>
                <PoolRoller initialExtra={r} target={n.target} onResult={(tot) => set(n.path, tot >= n.target)} />
                <div className="seg"><button className={`seg-btn tight ${n.value === true ? 'on' : ''}`} onClick={() => set(n.path, true)}>Passed</button><button className={`seg-btn tight ${n.value === false ? 'on' : ''}`} onClick={() => set(n.path, false)}>Failed</button></div>
              </li>
            );
          }
          case 'group': return <li key={n.path} className="eff group"><span className="small strong">{n.title}</span><EffectNodes nodes={n.children} st={st} set={set} crew={crew} /></li>;
        }
      })}
    </ul>
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

