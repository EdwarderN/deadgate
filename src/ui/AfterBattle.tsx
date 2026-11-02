// The after-battle steps and the break, in the book's order (13.1, 14.1).
import { useEffect, useState } from 'react';
import { getRules, plain } from '../data/rules';
import {
  battleXp, botWord, finishAfterBattle, injuryActions, injuryResult, injuryTableFor, leaguePoints, legendFor, partsIn, positionDef,
  sillyTableFor, stateNames, taskBlocked, taskDefs, totalLeaguePoints, type TaskDef,
} from '../engine/battle';
import { addLedger, advancesEarned, airTax, currentRatings, isBot } from '../engine/crew';
import { lookup } from '../engine/dice';
import { uid, type AfterBattle as After, type Crew, type Fighter } from '../engine/model';
import { go } from '../App';
import { Hire, Md, Shop, Stash, fighterLabel, patchFighter, type Update } from './common';
import { Experience } from './Campaign';
import { PoolRoller, RollOrEnter } from './Dice';
import { RuleLink, injuryRule, legendRule, sillyRule, tagRule } from './rule';

const STEPS = ['Words', 'Experience', 'Injuries', 'Captives', 'Advances', 'Air tax', 'Story event', 'Tasks', 'Spend', 'Wrap up'];

export function AfterBattleView({ crew, update }: { crew: Crew; update: Update }) {
  useEffect(() => { document.title = `After the battle: ${crew.name || 'Crew'}`; }, [crew.name]);
  const a = crew.after;
  if (!a) return (
    <div className="stack"><p className="empty">No battle to wrap up. Start one from the crew screen.</p><a className="btn" href={`#/crew/${crew.id}`}>Back to the crew</a></div>
  );
  const setA = (fn: (x: After) => After) => update((c) => (c.after ? { ...c, after: fn(c.after) } : c));
  const step = a.step;
  const goStep = (n: number) => { setA((x) => ({ ...x, step: n })); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const props = { crew, a, setA, update };
  return (
    <div className="after">
      <div className="build-head">
        <div>
          <h1 className="crew-title">After the battle</h1>
          <p className="muted small">{crew.name}{a.battle.opponent ? ` vs ${a.battle.opponent}` : ''} · {crew.parts} parts</p>
        </div>
        <a className="btn small" href={`#/crew/${crew.id}`}>Crew</a>
      </div>
      <nav className="steps" aria-label="After-battle steps">
        <ol>{STEPS.map((s, i) => (
          <li key={s}><button className={`step ${i === step ? 'on' : ''}`} aria-current={i === step ? 'step' : undefined} onClick={() => goStep(i)}><span className="step-n">{i + 1}</span> {s}</button></li>
        ))}</ol>
      </nav>
      <section className="step-body">
        <h2>{step + 1}. {STEPS[step]}</h2>
        {step === 0 && <WordsStep {...props} />}
        {step === 1 && <XpStep {...props} />}
        {step === 2 && <InjuriesStep {...props} />}
        {step === 3 && <CaptivesStep {...props} />}
        {step === 4 && <AdvancesStep {...props} />}
        {step === 5 && <TaxStep {...props} />}
        {step === 6 && <StoryStep {...props} />}
        {step === 7 && <TasksStep {...props} />}
        {step === 8 && <div className="stack"><p className="muted">Recharge, repair, buy, sell, hire and fit prosthetics (14.3, 11.3, 14.9). This is a new break: old stock needs a seller again.</p><Stash crew={crew} update={update} /><Shop crew={crew} update={update} /><Hire crew={crew} update={update} /></div>}
        {step === 9 && <WrapStep {...props} />}
      </section>
      <div className="step-nav">
        <button className="btn" disabled={step === 0} onClick={() => goStep(step - 1)}>Back</button>
        <span className="muted small">{crew.parts} parts</span>
        {step < STEPS.length - 1 ? <button className="btn primary" onClick={() => goStep(step + 1)}>Next: {STEPS[step + 1]}</button> : <span />}
      </div>
    </div>
  );
}

type P = { crew: Crew; a: After; setA: (fn: (x: After) => After) => void; update: Update };
const inBattle = (crew: Crew, a: After) => crew.fighters.filter((f) => a.battle.fighters[f.id]?.inBattle);
const setWord = (setA: P['setA'], fid: string, result: 'fulfilled' | 'failed') =>
  setA((x) => ({ ...x, battle: { ...x.battle, fighters: { ...x.battle.fighters, [fid]: { ...x.battle.fighters[fid], word: { ...x.battle.fighters[fid].word!, result } } } } }));

/** Gain or spend parts, with a note, into the ledger. */
export function PartsForm({ update, suggest }: { update: Update; suggest?: string }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState(suggest ?? '');
  return (
    <form className="row gap-s wrap parts-form" onSubmit={(e) => { e.preventDefault(); const n = parseInt(amount, 10); if (n) { update((c) => addLedger(c, n, note || (n > 0 ? 'Parts gained' : 'Parts paid'))); setAmount(''); } }}>
      <input className="num" inputMode="numeric" aria-label="Parts (use − to pay)" placeholder="± parts" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d-]/g, ''))} />
      <input className="grow" aria-label="What for" placeholder="What for" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn small">Add to ledger</button>
    </form>
  );
}

// ---------- 1. Words ----------
function WordsStep({ crew, a, setA, update }: P) {
  const rules = getRules();
  const sworn = inBattle(crew, a).filter((f) => a.battle.fighters[f.id].word);
  const lp = leaguePoints(rules, a.battle);
  return (
    <div className="stack">
      <p className="muted">Each Word is fulfilled or failed (13.5). Fulfilled: its XP (in the next step), and a Legend for Big or Legendary, and any silly trait is cleared. Failed: a silly trait.</p>
      {sworn.length === 0 && <p className="empty">No Words were sworn this battle.</p>}
      {sworn.map((f) => {
        const w = a.battle.fighters[f.id].word!;
        const deed = rules.deeds.find((d) => d.id === w.deed);
        const legend = legendFor(rules, w.deed);
        const table = sillyTableFor(rules, w.deed);
        const applied = a.wordsApplied[f.id];
        return (
          <div key={f.id} className="card stack-s">
            <strong>{fighterLabel(f)}: {w.deed} {deed?.name} <span className="muted">({w.audience})</span></strong>
            <div className="seg">
              <button className={`seg-btn ${w.result === 'fulfilled' ? 'on' : ''}`} disabled={applied} onClick={() => setWord(setA, f.id, 'fulfilled')}>Fulfilled</button>
              <button className={`seg-btn ${w.result === 'failed' ? 'on' : ''}`} disabled={applied} onClick={() => setWord(setA, f.id, 'failed')}>Failed</button>
            </div>
            {w.result === 'fulfilled' && !applied && (
              <button className="btn small primary" onClick={() => {
                patchFighter(update, f.id, (x) => ({ ...x, sillyTrait: null, legends: legend && !x.legends.some((l) => l.name === legend.name) ? [...x.legends, { id: uid('g'), name: legend.name, title: legend.title }] : x.legends, title: x.title || legend?.title || '' }));
                setA((x) => ({ ...x, wordsApplied: { ...x.wordsApplied, [f.id]: true } }));
              }}>{legend ? `Take the Legend ${legend.name}` : 'Record it'}{f.sillyTrait ? ' and clear the silly trait' : ''}</button>
            )}
            {w.result === 'failed' && !applied && table && <SillyRoll table={table} onPick={(name) => { patchFighter(update, f.id, (x) => ({ ...x, sillyTrait: name })); setA((x) => ({ ...x, wordsApplied: { ...x.wordsApplied, [f.id]: true } })); }} />}
            {applied && <span className="badge ok">Done{f.sillyTrait ? `: ${f.sillyTrait}` : ''}{legend && w.result === 'fulfilled' ? `: ${legend.name}` : ''}</span>}
            {legend && w.result === 'fulfilled' && <RuleLink rule={legendRule(rules, legend.name)}>Read the Legend</RuleLink>}
          </div>
        );
      })}
      <div className="card">
        <h3>League points <span className="section-tag">§ 14.12</span></h3>
        <table className="tbl"><tbody>{lp.map((r) => <tr key={r.label}><td>{r.label}</td><td>{r.count ? `×${r.count}` : ''}</td><td className="num">{r.points}</td></tr>)}</tbody>
          <tfoot><tr><th>Total</th><th /><th className="num">{totalLeaguePoints(rules, a.battle)}</th></tr></tfoot></table>
        <p className="muted small">They go in the season log at the last step.</p>
      </div>
    </div>
  );
}

function SillyRoll({ table, onPick }: { table: string; onPick: (name: string) => void }) {
  const rules = getRules();
  const [n, setN] = useState<number | null>(null);
  const rows = rules.silly.filter((s) => s.table === table);
  const hit = n !== null ? rows[n - 1] : null;
  return (
    <div className="stack-s">
      <span className="small">A silly trait from the <strong>{table}</strong> table (13.7):</span>
      <RollOrEnter die="d6" value={n} onResult={setN} />
      {hit && <div className="result"><RuleLink rule={sillyRule(rules, hit.name)}>{hit.name}</RuleLink> ("{hit.title}"): <Md text={hit.text} /> <button className="btn small primary" onClick={() => onPick(hit.name)}>Take it</button></div>}
    </div>
  );
}

// ---------- 2. XP ----------
function XpStep({ crew, a, setA, update }: P) {
  const rules = getRules();
  const fighters = inBattle(crew, a);
  const lines = Object.fromEntries(fighters.map((f) => [f.id, battleXp(rules, crew, a.battle, f.id)]));
  const total = (id: string) => lines[id].reduce((s, l) => s + l.xp, 0) + (a.extraXp[id] ?? 0);
  return (
    <div className="stack">
      <p className="muted">Generic XP, Words and underdog XP (13.4, 13.5, 11.5). Add any faction, research or other XP in the last column.</p>
      <div className="table-scroll">
        <table className="tbl">
          <thead><tr><th>Fighter</th><th>Earned</th><th>Other XP</th><th className="num">Total</th></tr></thead>
          <tbody>{fighters.map((f) => (
            <tr key={f.id}>
              <td>{fighterLabel(f)}<div className="muted small">{a.battle.fighters[f.id].position}</div></td>
              <td className="small">{lines[f.id].map((l) => `${l.label} +${l.xp}`).join(', ') || '–'}</td>
              <td><input type="number" className="num" aria-label={`Other XP for ${fighterLabel(f)}`} disabled={a.xpApplied} value={a.extraXp[f.id] ?? 0} onChange={(e) => setA((x) => ({ ...x, extraXp: { ...x.extraXp, [f.id]: +e.target.value || 0 } }))} /></td>
              <td className="num"><strong>{total(f.id)}</strong></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {a.xpApplied ? <span className="badge ok">XP added to the cards</span> : (
        <button className="btn primary" onClick={() => {
          update((c) => ({ ...c, fighters: c.fighters.map((f) => (lines[f.id] ? { ...f, xp: f.xp + total(f.id) } : f)) }));
          setA((x) => ({ ...x, xpApplied: true }));
        }}>Add the XP to the cards</button>
      )}
    </div>
  );
}

// ---------- 3. Injuries ----------
function InjuriesStep({ crew, a, setA, update }: P) {
  const rules = getRules();
  const rolling = inBattle(crew, a).filter((f) => injuryTableFor(rules, a.battle, f.id));
  return (
    <div className="stack">
      <p className="muted">Only fighters who ended the battle down roll (13.2). Gentle table: evacuated, captured, or your side holds the field. Harsh: left behind. Roll a d66 in the app or with your own dice.</p>
      {rolling.length === 0 && <p className="empty">Nobody went down. The med-assistant is disappointed.</p>}
      {rolling.map((f) => <InjuryCard key={f.id} crew={crew} f={f} a={a} setA={setA} update={update} />)}
    </div>
  );
}

function InjuryCard({ f, a, setA, update }: { crew: Crew; f: Fighter; a: After; setA: P['setA']; update: Update }) {
  const rules = getRules();
  const t = injuryTableFor(rules, a.battle, f.id)!;
  const st = a.injuries[f.id] ?? { rolls: [], done: false, notes: '' };
  const set = (p: Partial<typeof st>) => setA((x) => ({ ...x, injuries: { ...x.injuries, [f.id]: { ...st, ...p } } }));
  const [chosen, setChosen] = useState<number | null>(null);
  const roll = chosen ?? (st.rolls.length === 1 ? st.rolls[0] : null);
  const row = roll !== null ? injuryResult(rules, t.table, roll) : undefined;
  const bot = isBot(rules, f);
  const actions = row ? injuryActions(rules, row.Result) : [];
  const fates = rules.crew.afterBattle;
  const toRoll = (fate: string) => update((c) => ({
    ...c,
    fighters: c.fighters.filter((x) => x.id !== f.id),
    captainId: c.captainId === f.id ? null : c.captainId,
    items: c.items.filter((o) => !(o.fighterId === f.id && o.slot === 'fitted')).map((o) => (o.fighterId === f.id ? { ...o, fighterId: null, slot: 'stash' } : o)),
    notes: { ...c.notes, roll: [...c.notes.roll, { id: uid('r'), name: fighterLabel(f), titles: [f.title, ...f.titles].filter(Boolean).join(', '), fate, note: `After the battle${a.battle.opponent ? ` against ${a.battle.opponent}` : ''}` }] },
  }));
  return (
    <div className="card stack-s">
      <strong>{fighterLabel(f)} <span className="muted small">{a.battle.fighters[f.id].position} · {t.table}{t.times > 1 ? `, twice: take the worse` : ''}{bot ? ' · a bot: bot words, glitches (13.3)' : ''}</span></strong>
      {st.rolls.length < t.times && !st.done && <RollOrEnter die="d66" onResult={(n) => set({ rolls: [...st.rolls, n] })} label={`Roll ${t.table.replace(/^The /, '')}`} />}
      {st.rolls.length > 1 && (
        <div className="seg">{st.rolls.map((r, i) => <button key={i} className={`seg-btn ${chosen === r ? 'on' : ''}`} onClick={() => setChosen(r)}>{r}: {plain(injuryResult(rules, t.table, r)?.Result ?? '').split('.')[0]}</button>)}</div>
      )}
      {row && (
        <div className="result">
          <strong>{roll}:</strong> <Md text={row.Result} />
          {bot && actions.filter((x) => x.kind === 'status').map((x) => <span key={x.value} className="muted small"> (for a bot: {botWord(rules, x.word ?? x.value)})</span>)}
        </div>
      )}
      {row && !st.done && (
        <div className="row gap-s wrap">
          {actions.map((x) => x.kind === 'status' ? (
            <button key={`s${x.value}`} className="btn small" onClick={() => patchFighter(update, f.id, (y) => ({ ...y, status: x.value }))}>Set {x.value}{f.status === x.value ? ' ✓' : ''}</button>
          ) : x.kind === 'dead' ? (
            <button key="dead" className="btn small danger" onClick={() => { if (confirm(`${fighterLabel(f)} is ${bot ? fates.botDeadFate.value.toLowerCase() : 'dead'}. Put them on the crew's roll?`)) { toRoll(bot ? fates.botDeadFate.value : fates.deadResult.value); set({ done: true }); } }}>
              {bot ? fates.botDeadFate.value : fates.deadResult.value}: to the roll</button>
          ) : (
            <LastingInjury key={`l${x.value}`} f={f} list={x.value} update={update} />
          ))}
          <button className="btn small primary" onClick={() => set({ done: true })}>Done</button>
        </div>
      )}
      {st.done && <span className="badge ok">Done · {f.status}{f.injuries.length ? ` · ${f.injuries.join(', ')}` : ''}</span>}
      <input className="small-input" placeholder="Notes (parts paid, XP, a free peg-leg…)" aria-label="Notes" value={st.notes} onChange={(e) => set({ notes: e.target.value })} />
      {row && /parts|XP|contact|finds|peg-leg|robo-arm|Hyped|prone/.test(row.Result) && <PartsForm update={update} suggest={`${fighterLabel(f)}: ${plain(row.Result).split('.')[0]}`} />}
    </div>
  );
}

function LastingInjury({ f, list, update }: { f: Fighter; list: string; update: Update }) {
  const rules = getRules();
  const [n, setN] = useState<number | null>(null);
  const bot = isBot(rules, f);
  const rows = bot ? rules.glitches : rules.injuries.filter((i) => i.table === list);
  const hit = n !== null ? rows[n - 1] : null;
  const max = rules.crew.limits.maxLastingInjuries.value;
  const laidUp = rules.crew.campaign.statuses.value.find((s) => /laid/i.test(s)) ?? '';
  const full = f.injuries.length >= max;
  return (
    <div className="stack-s lasting">
      <span className="small">{bot ? 'A glitch (d6, 13.3)' : `${list} lasting injury (d6)`}{full ? `: already ${max}, so ${laidUp} instead (13.2)` : ''}</span>
      {full ? <button className="btn small" onClick={() => patchFighter(update, f.id, (y) => ({ ...y, status: laidUp }))}>Set {laidUp}</button> : <RollOrEnter die="d6" value={n} onResult={setN} />}
      {hit && !full && (f.injuries.includes(hit.name)
        ? <span className="small">{hit.name}: they have it already, roll again (13.2).</span>
        : <span className="small"><RuleLink rule={injuryRule(rules, hit.name)}>{hit.name}</RuleLink> ("{hit.title}") <button className="btn small primary" onClick={() => { patchFighter(update, f.id, (y) => ({ ...y, injuries: [...y.injuries, hit.name], titles: hit.title ? Array.from(new Set([...y.titles, hit.title])) : y.titles })); setN(null); }}>Add it</button></span>)}
    </div>
  );
}

// ---------- 4. Captives ----------
function CaptivesStep({ crew, a, update }: P) {
  const rules = getRules();
  const captured = inBattle(crew, a).filter((f) => positionDef(rules, a.battle.fighters[f.id].position)?.captured);
  const taken = rules.crew.afterBattle.takenFate.value;
  return (
    <div className="stack">
      <p className="muted">A captor names a price from 10 parts up to 10 + the captive's Experience (at most 30). The owner pays, or refuses and the captive's fate happens (14.4). Ransoms to the Ledgerhands cannot be refused (12.5).</p>
      {captured.map((f) => (
        <div key={f.id} className="card stack-s">
          <strong>{fighterLabel(f)} was captured</strong>
          <PartsForm update={update} suggest={`Ransom for ${fighterLabel(f)}`} />
          <button className="btn small danger" onClick={() => { if (confirm(`${fighterLabel(f)} is ${taken}: off the roster, onto the roll. Their gear stays with the captors.`)) update((c) => ({ ...c, fighters: c.fighters.filter((x) => x.id !== f.id), captainId: c.captainId === f.id ? null : c.captainId, items: c.items.filter((o) => o.fighterId !== f.id), notes: { ...c.notes, roll: [...c.notes.roll, { id: uid('r'), name: fighterLabel(f), titles: [f.title, ...f.titles].filter(Boolean).join(', '), fate: taken, note: a.battle.opponent ? `Taken by ${a.battle.opponent}` : '' }] } })); }}>Refused: {taken}</button>
        </div>
      ))}
      <div className="card stack-s">
        <h3>Did you take a captive?</h3>
        <p className="small muted">Record the ransom you were paid, or the half price and your faction's captive fate.</p>
        <PartsForm update={update} suggest="Ransom received" />
      </div>
    </div>
  );
}

// ---------- 5. Advances ----------
function AdvancesStep({ crew, update }: P) {
  const rules = getRules();
  const due = crew.fighters.filter((f) => advancesEarned(rules, f.xp) > f.advances.length);
  return (
    <div className="stack">
      <p className="muted">A fighter who has crossed an XP threshold takes one advance (13.4).</p>
      {due.length === 0 && <p className="empty">No advances due. Next time.</p>}
      {due.map((f) => <div key={f.id} className="card"><h3>{fighterLabel(f)}</h3><Experience crew={crew} fighter={f} update={update} /></div>)}
    </div>
  );
}

// ---------- 6. Air tax ----------
function TaxStep({ crew, a, setA, update }: P) {
  const rules = getRules();
  const t = airTax(rules, crew);
  return (
    <div className="stack">
      <p>{rules.crew.campaign.airTax.value} parts for each fighter; {rules.crew.campaign.airTax.exempt.join(', ')} fighters don't pay (14.3). This break: <strong>{t.amount} parts</strong> ({t.payers.map(fighterLabel).join(', ') || 'nobody'}).</p>
      <p className="muted small">A fighter whose tax goes unpaid misses their task this break.</p>
      {a.taxPaid ? <span className="badge ok">Paid</span> : <button className="btn primary" onClick={() => { update((c) => addLedger(c, -t.amount, `Air tax (${t.payers.length} fighters)`)); setA((x) => ({ ...x, taxPaid: true })); }}>Pay {t.amount} parts</button>}
    </div>
  );
}

// ---------- 7. Story event ----------
function StoryStep({ crew, a, setA, update }: P) {
  const rules = getRules();
  const rows = rules.data.story_rows;
  const keys = Object.keys(rules.data.story_events);
  const key = keys.find((k) => k.startsWith(`Row ${a.story.row}:`));
  const ev = key && a.story.roll !== null ? lookup(rules.data.story_events[key], a.story.roll) : null;
  const [tag, setTag] = useState('');
  return (
    <div className="stack">
      <p className="muted">One story event per crew. Choose the row that fits the battle, then a d6 (14.5). A crew with a rumour may cross it off to choose any row.</p>
      <div className="stack-s" role="radiogroup" aria-label="Story row">
        {rows.map((r) => (
          <label key={r.Row} className={`option ${a.story.row === r.Row ? 'on' : ''}`}>
            <input type="radio" name="story-row" checked={a.story.row === r.Row} onChange={() => setA((x) => ({ ...x, story: { ...x.story, row: r.Row, roll: null } }))} />
            <span>{r.Row}. <Md text={r['Choose it when the crew...']} /></span>
          </label>
        ))}
      </div>
      {key && <RollOrEnter die="d6" value={a.story.roll} onResult={(n) => setA((x) => ({ ...x, story: { ...x.story, roll: n } }))} />}
      {ev && (
        <div className="card stack-s">
          <h3><Md text={ev.Event} /></h3>
          <p><strong>Accept:</strong> <Md text={ev.Accept} /></p>
          {ev.Pay !== 'None' && <p><strong>Pay:</strong> <Md text={ev.Pay} /></p>}
          {ev.Twist !== 'None' && <p><strong>Twist</strong> (a test, Routine 6 unless it says): <Md text={ev.Twist} /></p>}
          {ev.Twist !== 'None' && <PoolRoller target={rules.data.difficulties[0] ? +rules.data.difficulties[0].Target : null} label="Twist test" />}
          <PartsForm update={update} suggest={`Story event: ${plain(ev.Event).split('.')[0]}`} />
          <div className="row gap-s wrap">
            <select aria-label="Tag" value={tag} onChange={(e) => setTag(e.target.value)}><option value="">Gain a tag…</option>{rules.tags.map((t) => <option key={t.name}>{t.name}</option>)}</select>
            <button className="btn small" disabled={!tag} onClick={() => { update((c) => ({ ...c, notes: { ...c.notes, tags: [...c.notes.tags.filter((x) => x !== tag), tag].slice(-rules.crew.limits.maxTags.value) } })); setTag(''); }}>Add</button>
            {crew.notes.tags.map((t) => <RuleLink key={t} rule={tagRule(rules, t)}><span className="badge">{t}</span></RuleLink>)}
          </div>
          <textarea rows={2} placeholder="What happened" aria-label="Story notes" value={a.story.notes} onChange={(e) => setA((x) => ({ ...x, story: { ...x.story, notes: e.target.value } }))} />
        </div>
      )}
    </div>
  );
}

// ---------- 8. Tasks ----------
function TasksStep({ crew, a, setA, update }: P) {
  const rules = getRules();
  const defs = taskDefs(rules, crew);
  return (
    <div className="stack">
      <p className="muted">Each fighter who may takes one task: the test, then win or lose a roll on the task's table (14.6). Sore, Laid up, fitting a prosthetic, unpaid air tax, hired this break, or teaching Train: no task.</p>
      {crew.fighters.map((f) => <TaskCard key={f.id} crew={crew} f={f} defs={defs} a={a} setA={setA} update={update} />)}
    </div>
  );
}

function TaskCard({ f, defs, a, setA, update }: { crew: Crew; f: Fighter; defs: TaskDef[]; a: After; setA: P['setA']; update: Update }) {
  const rules = getRules();
  const st = a.tasks[f.id] ?? { task: '', success: null, testTotal: null, tableRoll: null, paid: false };
  const set = (p: Partial<typeof st>) => setA((x) => ({ ...x, tasks: { ...x.tasks, [f.id]: { ...st, ...p } } }));
  const def = defs.find((d) => d.name === st.task);
  const r = currentRatings(rules, f);
  const [rating, setRating] = useState<string>('');
  const ratingUsed = def ? (def.ratings === 'any' ? rating || rules.crew.limits.ratingNames.value.find((n) => r[n] >= 1) || '' : def.ratings.length > 1 ? rating || def.ratings[0] : def.ratings[0]) : '';
  const pay = def && st.success !== null ? (st.success ? def.success : def.failure) : '';
  const parts = pay ? partsIn(pay) : null;
  const row = def && st.tableRoll !== null ? lookup(def.table, st.tableRoll) : null;
  if (taskBlocked(rules, f)) return <div className="card muted small">{fighterLabel(f)}: {f.status}, no task this break.</div>;
  return (
    <div className="card stack-s">
      <div className="row gap-s wrap between">
        <strong>{fighterLabel(f)}</strong>
        <select aria-label={`Task for ${fighterLabel(f)}`} value={st.task} onChange={(e) => set({ task: e.target.value, success: null, testTotal: null, tableRoll: null, paid: false })}>
          <option value="">No task</option>
          {defs.map((d) => <option key={d.name} value={d.name}>{d.name}{d.own ? ' (faction)' : ''}</option>)}
        </select>
      </div>
      {def && (
        <>
          <p className="small"><strong>Test:</strong> {plain(def.test)}. <strong>Success:</strong> <Md text={def.success} />{def.failure ? <> <strong>Failure:</strong> <Md text={def.failure} /></> : null}</p>
          {(def.ratings === 'any' || def.ratings.length > 1) && (
            <label className="field"><span>Rating used</span>
              <select value={ratingUsed} onChange={(e) => setRating(e.target.value)}>{(def.ratings === 'any' ? rules.crew.limits.ratingNames.value : def.ratings).map((n) => <option key={n} value={n}>{n} {r[n]}</option>)}</select>
            </label>
          )}
          <PoolRoller key={`${def.name}-${ratingUsed}`} initialExtra={r[ratingUsed] ?? 0} target={def.target} label={`${ratingUsed} ${r[ratingUsed] ?? 0}`} onResult={(t) => set({ testTotal: t, success: def.target !== null ? t >= def.target : null })} />
          <div className="seg">
            <button className={`seg-btn ${st.success === true ? 'on' : ''}`} onClick={() => set({ success: true })}>Success</button>
            <button className={`seg-btn ${st.success === false ? 'on' : ''}`} onClick={() => set({ success: false })}>Failure</button>
          </div>
          {parts !== null && !st.paid && <button className="btn small primary" onClick={() => { update((c) => addLedger(c, parts, `${fighterLabel(f)}: ${def.name}`)); set({ paid: true }); }}>Add {parts} parts</button>}
          {st.paid && <span className="badge ok">Paid</span>}
          {st.success !== null && def.table.length > 0 && (
            <>
              <span className="small">Win or lose, the {def.name} table ({def.die}):</span>
              <RollOrEnter die={def.die === 'd6' ? 'd6' : '2d6'} value={st.tableRoll} onResult={(n) => set({ tableRoll: n })} />
              {row && <p className="result"><strong>{st.tableRoll}:</strong> <Md text={row.Result} /></p>}
              {row && <PartsForm update={update} suggest={`${fighterLabel(f)}: ${plain(row.Result).split('.')[0]}`} />}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ---------- 10. Wrap up ----------
function WrapStep({ crew, a, setA, update }: P) {
  const rules = getRules();
  const states = [...stateNames(rules), ...rules.crew.battle.positions.value.filter((p) => !p.injury && p.cameHome && p.name !== rules.crew.battle.positions.value[0].name).map((p) => p.name)];
  const pts = totalLeaguePoints(rules, a.battle);
  const finish = () => {
    update((c) => {
      let next: Crew = {
        ...c,
        fighters: c.fighters.map((f) => (a.history[f.id]?.trim() ? { ...f, history: [...f.history, a.history[f.id].trim()], word: '' } : { ...f, word: '' })),
      };
      if (!a.seasonLogged) {
        next = { ...next, notes: { ...next.notes, season: [...next.notes.season, { id: uid('s'), battle: String(next.notes.season.length + 1), world: a.battle.world, opponent: a.battle.opponent, winCond: a.battle.winCond ? 'Met' : '', heldField: a.battle.heldField ? 'Yes' : 'No', story: a.story.notes || (a.story.row ? `Row ${a.story.row}, ${a.story.roll ?? ''}` : ''), points: pts }] } };
      }
      return finishAfterBattle(next);
    });
    go(`/crew/${crew.id}`);
  };
  return (
    <div className="stack">
      <p className="muted">Update the cards: one line of History for each fighter, and anything they start the next battle with (13.1, 14.6).</p>
      {crew.fighters.map((f) => (
        <div key={f.id} className="card stack-s">
          <strong>{fighterLabel(f)} <span className="muted small">{f.status} · {f.xp} XP</span></strong>
          <input aria-label={`History for ${fighterLabel(f)}`} placeholder="One line of History" value={a.history[f.id] ?? ''} onChange={(e) => setA((x) => ({ ...x, history: { ...x.history, [f.id]: e.target.value } }))} />
          <div className="seg wrap">
            <span className="small">Starts the next battle:</span>
            {states.map((s) => {
              const on = (f.nextBattle ?? []).includes(s);
              return <button key={s} className={`seg-btn tight ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => patchFighter(update, f.id, (x) => ({ ...x, nextBattle: on ? (x.nextBattle ?? []).filter((y) => y !== s) : [...(x.nextBattle ?? []), s] }))}>{s}</button>;
            })}
          </div>
        </div>
      ))}
      <p>Season log: {a.battle.opponent || 'this battle'}, <strong>{pts} league points</strong>.</p>
      <button className="btn primary" onClick={finish}>Finish the break</button>
    </div>
  );
}
