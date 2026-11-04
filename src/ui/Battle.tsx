// The battle companion: a tracker for the table (chapters 5, 6, 9).
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { getRules, plain } from '../data/rules';
import {
  addCondition, bandLower, canSwear, conditionLabel, conditionsFor, endActivation, isDown, newBattle, nextRound, positionDef, positions, roundEnd,
  RUMOUR, deedTier, shotSeverity, startAfterBattle, stateNames, toggleState, underdogFor, wordName, wordsAllowed,
} from '../engine/battle';
import { addLedger, canSpend, captainOf, equipped, fighterStats, hasGift, isBot, strength } from '../engine/crew';
import { activeEffects, rulesInForce, type ActiveEffect } from '../engine/faction';
import { lookup, severityOfMargin } from '../engine/dice';
import type { Battle, BattleFighter, Crew, Fighter } from '../engine/model';
import { go } from '../App';
import { Md, describeType, fighterLabel, type Update } from './common';
import { PoolRoller, RollOrEnter } from './Dice';
import { useAsk } from './confirm';
import { RuleLink, giftRule, glossaryRule, itemRule, powersFor, sectionRule } from './rule';
import { MdBlock } from './md';
import { BreakingCard, GearFailTool, GlossaryTool, Grenades, GrenadeTool, Madness, MoreTables, WorldPanel, WorldSetup, scenarioOf } from './BattleExtras';

export function BattleView({ crew, update }: { crew: Crew; update: Update }) {
  const rules = getRules();
  useEffect(() => { document.title = `Battle: ${crew.name || 'Crew'}`; }, [crew.name]);
  const b = crew.battle;
  if (!b) {
    return (
      <div className="stack">
        <h1>Battle companion</h1>
        <p>Track Energy, conditions, states and Words on the table, with the dice and tables at hand. After the battle it takes you through the after-battle steps.</p>
        <button className="btn primary" onClick={() => update((c) => ({ ...c, battle: newBattle(rules, c) }))}>Set up a battle</button>
        <a className="btn" href={`#/crew/${crew.id}`}>Back to the crew</a>
      </div>
    );
  }
  const setB = (fn: (b: Battle) => Battle) => update((c) => (c.battle ? { ...c, battle: fn(c.battle) } : c));
  const setF = (id: string, fn: (f: BattleFighter) => BattleFighter) => setB((x) => ({ ...x, fighters: { ...x.fighters, [id]: fn(x.fighters[id]) } }));
  return (
    <div className="battle">
      <div className="build-head no-print">
        <div>
          <h1 className="crew-title">{crew.name || 'Crew'} {b.opponent ? <span className="muted">vs {b.opponent}</span> : null}</h1>
          <p className="muted small">{b.phase === 'setup' ? 'Setting up' : b.phase === 'playing' ? `Round ${b.round}` : 'Battle over'}{b.world ? ` · ${b.world}` : ''}</p>
        </div>
        <a className="btn small" href={`#/crew/${crew.id}`}>Crew</a>
      </div>
      {b.phase === 'setup' && <Setup crew={crew} b={b} setB={setB} setF={setF} update={update} />}
      {b.phase === 'playing' && <Playing crew={crew} b={b} setB={setB} setF={setF} update={update} />}
      {b.phase === 'ended' && <EndBattle crew={crew} b={b} setB={setB} update={update} />}
    </div>
  );
}

type SetB = (fn: (b: Battle) => Battle) => void;
type SetF = (id: string, fn: (f: BattleFighter) => BattleFighter) => void;

// ---------- setup ----------
function Setup({ crew, b, setB, setF, update }: { crew: Crew; b: Battle; setB: SetB; setF: SetF; update: Update }) {
  const rules = getRules();
  const allowed = wordsAllowed(rules, crew, b);
  const sworn = Object.values(b.fighters).filter((f) => f.inBattle && f.word).length;
  const ud = underdogFor(rules, crew, b);
  const audiences = rules.data.word_audiences.map((a) => plain(a.Audience));
  const tiers = Array.from(new Set(rules.deeds.map((d) => d.tier)));
  const stakes = rules.crew.battle.wagerStakes;
  const sillyTierUp = (f: Fighter) => !!(f.sillyTrait && rules.crew.campaign.sillyEffects.value[f.sillyTrait]?.tierUp && f.lastFailedTier);
  /** "Doubled down": the next Word one tier higher than the failed one; the top tier stays (13.7). */
  const allowedTiers = (f: Fighter) => {
    if (!sillyTierUp(f)) return tiers;
    const order = Object.keys(rules.data.deed_tiers);
    const i = order.findIndex((k) => rules.data.deed_tiers[k].tier === f.lastFailedTier);
    return tiers.filter((t) => order.indexOf(t) >= Math.min(i + 1, order.length - 1));
  };
  return (
    <div className="stack">
      <div className="card stack-s">
        <h3>The opponent</h3>
        <div className="row gap wrap">
          <label className="field grow"><span>Opponent</span><input value={b.opponent} onChange={(e) => setB((x) => ({ ...x, opponent: e.target.value }))} placeholder="Their crew's name" /></label>
        </div>
        <div className="row gap wrap">
          <label className="field"><span>Their fighters</span><input type="number" min={0} className="num" value={b.opponentFighters ?? ''} onChange={(e) => setB((x) => ({ ...x, opponentFighters: e.target.value === '' ? null : +e.target.value }))} /></label>
          <label className="field"><span>Their total XP</span><input type="number" min={0} className="num" value={b.opponentXp ?? ''} onChange={(e) => setB((x) => ({ ...x, opponentXp: e.target.value === '' ? null : +e.target.value }))} /></label>
        </div>
        <p className="small">
          Your strength: {strength(crew)}. {b.opponentFighters !== null && (ud.underdog === 'us' ? <strong>You are the underdog: +{ud.xp} XP each after the battle (11.5).</strong> : ud.underdog === 'them' ? `They are the underdog: +${ud.xp} XP each for them.` : 'Nobody is the underdog.')}
        </p>
      </div>
      <WorldSetup crew={crew} b={b} setB={setB} />
      <div className="card stack-s">
        <h3>Who takes part, and the Words <span className="muted small">({sworn}/{allowed} Words, 13.5)</span></h3>
        {allowed === 0 && <p className="muted small">{crew.faction} swears no Words.</p>}
        {crew.fighters.map((f) => {
          const bf = b.fighters[f.id];
          if (!bf) return null;
          const swear = canSwear(rules, crew, f);
          return (
            <div key={f.id} className={`setup-row ${bf.inBattle ? '' : 'out'}`}>
              <label className="check"><input type="checkbox" checked={bf.inBattle} onChange={(e) => setF(f.id, (x) => ({ ...x, inBattle: e.target.checked }))} />
                <strong>{fighterLabel(f)}</strong> <span className="muted small">{describeType(f)}{f.status !== rules.crew.campaign.statuses.value[0] ? ` · ${f.status}` : ''}</span></label>
              {bf.inBattle && swear && allowed > 0 && (
                <div className="row gap-s wrap">
                  <select aria-label={`${fighterLabel(f)}'s Word`} value={bf.word?.deed ?? ''} disabled={!bf.word && sworn >= allowed}
                    onChange={(e) => setF(f.id, (x) => ({ ...x, word: e.target.value ? { deed: e.target.value, audience: x.word?.audience ?? audiences[0] } : null }))}>
                    <option value="">No Word</option>
                    {f.rumour?.name && !f.rumour.done && <optgroup label="Their rumour (a Big vow, 13.9)"><option value={`${RUMOUR}${f.rumour.name}`}>{f.rumour.name}</option></optgroup>}
                    {allowedTiers(f).map((t) => <optgroup key={t} label={t}>{rules.deeds.filter((d) => d.tier === t).map((d) => <option key={d.id} value={d.id}>{d.id} {d.name}</option>)}</optgroup>)}
                  </select>
                  {bf.word && !bf.word.deed.startsWith(RUMOUR) && (
                    <select aria-label="Audience" value={bf.word.audience} onChange={(e) => setF(f.id, (x) => ({ ...x, word: { ...x.word!, audience: e.target.value } }))}>
                      {audiences.map((a) => <option key={a}>{a}</option>)}
                    </select>
                  )}
                  {bf.word?.audience === stakes.audience && (crew.notes.tags.includes(stakes.noTakerTag)
                    ? <span className="small muted">{stakes.noTakerTag}: nobody takes the bet, so it is a vow (14.10).</span>
                    : stakes.alwaysTakerTag && crew.notes.tags.includes(stakes.alwaysTakerTag)
                    ? <span className="small muted">{stakes.alwaysTakerTag}: the bet is always taken (stake {stakes.value[deedTier(rules, bf.word.deed)?.tier ?? ''] ?? 0} parts, 14.10).</span>
                    : <label className="check small"><input type="checkbox" checked={bf.word.taker !== false} onChange={(e) => setF(f.id, (x) => ({ ...x, word: { ...x.word!, taker: e.target.checked } }))} /> Someone took the bet (stake {stakes.value[deedTier(rules, bf.word.deed)?.tier ?? ''] ?? 0} parts)</label>)}
                  {bf.word && sillyTierUp(f) && <span className="small muted">{f.sillyTrait}: this Word must be a tier above the one they failed (13.7).</span>}
                  {bf.word && <DeedText id={bf.word.deed} audience={bf.word.audience} />}
                </div>
              )}
              {bf.states.length > 0 && <p className="small muted">Starts with: {bf.states.join(', ')}</p>}
            </div>
          );
        })}
      </div>
      <FactionSetup crew={crew} b={b} setB={setB} update={update} />
      <button className="btn primary" onClick={() => setB((x) => ({ ...x, phase: 'playing', round: 1, log: [...x.log, { round: 1, text: 'Battle started' }] }))}>Start the battle</button>
    </div>
  );
}

function DeedText({ id, audience }: { id: string; audience?: string }) {
  const rules = getRules();
  // the rule for the kind of Word sworn (vow, boast, wager: 13.5), as the book's table gives it
  const aud = rules.data.word_audiences.find((a) => plain(a.Audience) === audience);
  const audLines: [string, string][] = aud ? [[`As a ${plain(aud.Audience).toLowerCase()}`, aud['What it is']], ['If fulfilled', aud.Fulfilled], ['If failed', aud.Failed]] : [];
  if (id.startsWith(RUMOUR)) {
    const r = rules.data.rumours.find((x) => plain(x.Rumour).startsWith(id.slice(RUMOUR.length)));
    return r ? <RuleLink rule={{ title: plain(r.Rumour).split('.')[0], section: rules.section('rumour'), lines: [['Deed', r.Deed], ['Legend', r.Legend], ...audLines] }}>read</RuleLink> : null;
  }
  const d = rules.deeds.find((x) => x.id === id);
  if (!d) return null;
  return <RuleLink rule={{ title: `${d.id} ${d.name}`, section: rules.section('deed'), lines: [[d.tier, d.text], ...(d.legend ? [['Legend', d.legend] as [string, string]] : []), ...audLines] }}>read</RuleLink>;
}

// ---------- playing ----------
function Playing({ crew, b, setB, setF, update }: { crew: Crew; b: Battle; setB: SetB; setF: SetF; update: Update }) {
  const ask = useAsk();
  const rules = getRules();
  const [tool, setTool] = useState<string | null>(null);
  const [rollFor, setRollFor] = useState<number | null>(null);
  const R = rules.crew.battle;
  const end = roundEnd(rules, b.round);
  const fighters = crew.fighters.filter((f) => b.fighters[f.id]?.inBattle);
  const allDone = fighters.every((f) => b.fighters[f.id].activated || isDown(rules, b.fighters[f.id]));
  const next = () => { setB((x) => nextRound(x)); setRollFor(null); };
  const over = () => setB((x) => ({ ...x, phase: 'ended', log: [...x.log, { round: x.round, text: 'Battle over' }] }));
  return (
    <div className="stack">
      {/* a slim bar that stays on screen; everything else about the round scrolls with the page */}
      <div className="round-bar">
        <strong className="round-num">Round {b.round}</strong>
        <span className="muted small">{fighters.filter((f) => b.fighters[f.id].activated).length}/{fighters.length} activated</span>
        <span className="grow" />
        {end === 'continue' && <button className={`btn small ${allDone ? 'primary' : ''}`} onClick={next}>End round {b.round}</button>}
        {end === 'roll' && <a className="btn small" href="#round-end" onClick={(e) => { e.preventDefault(); document.getElementById('round-end')?.scrollIntoView({ behavior: 'smooth' }); }}>End of round ↓</a>}
      </div>
      <div className="card stack-s">
        <BreakingCard crew={crew} b={b} setB={setB} />
        {b.round === R.pod.value && <PodRoll crew={crew} b={b} setB={setB} />}
        <RoundStart crew={crew} b={b} />
        <WorldPanel b={b} setB={setB} />
        <div className="row gap-s wrap" id="round-end">
          {end === 'roll' && (
            <div className="stack-s">
              <span className="small">End of round {b.round}: a d6, {R.rounds.extraRoundOn}+ plays another round (9.3).</span>
              <RollOrEnter die="d6" value={rollFor} onResult={(n) => setRollFor(n)} />
              {rollFor !== null && (rollFor >= R.rounds.extraRoundOn ? <button className="btn primary" onClick={next}>Another round: {b.round + 1}</button> : <button className="btn primary" onClick={over}>The battle ends</button>)}
            </div>
          )}
          {end === 'over' && <span className="small">Round {R.rounds.max} is the last (9.3).</span>}
          <button className="btn" onClick={async () => { if (await ask('End the battle now?')) over(); }}>End the battle</button>
        </div>
      </div>
      <div className="battle-grid">
        {fighters.map((f) => <BattleCard key={f.id} crew={crew} f={f} bf={b.fighters[f.id]} set={(fn) => setF(f.id, fn)} update={update} />)}
      </div>
      <ResearchTracker crew={crew} b={b} setB={setB} />
      <Tools crew={crew} tool={tool} setTool={setTool} />
      <RulesInForce crew={crew} />
    </div>
  );
}

function PodRoll({ crew, b, setB }: { crew: Crew; b: Battle; setB: SetB }) {
  const rules = getRules();
  const P = rules.crew.battle.pod;
  const roll = b.pod?.roll ?? null;
  const drop = b.pod?.drop ?? null;
  const setRoll = (n: number) => setB((x) => ({ ...x, pod: { ...(x.pod ?? { drop: null }), roll: n } }));
  const setDrop = (n: number) => setB((x) => ({ ...x, pod: { ...(x.pod ?? { roll: null }), drop: n } }));
  const row = drop !== null ? lookup(rules.data.drop_table, drop) : null;
  return (
    <div className="pod note">
      <span className="small">Start of round {P.value}: a d6, on {P.fallsOn}+ a pod falls ({P.source}).</span>
      <RollOrEnter die="d6" value={roll} onResult={setRoll} />
      {roll !== null && (roll >= P.fallsOn ? <strong>A pod falls! When someone cracks it open:</strong> : <span>No pod this battle.</span>)}
      {roll !== null && roll >= P.fallsOn && activeEffects(rules, crew, 'pod').map((e) => <FactionNote key={e.effect.id} e={e} />)}
      {roll !== null && roll >= P.fallsOn && (
        <>
          <RollOrEnter die="d66" label="Crack it open (drop table)" value={drop} onResult={setDrop} />
          {row && <p><Md text={row['What came out']} /></p>}
          {row && <label className="check small"><input type="checkbox" checked={!!b.pod?.ours} onChange={(e) => setB((x) => ({ ...x, pod: { ...x.pod!, ours: e.target.checked } }))} /> One of ours opened it</label>}
          {scenarioOf(b)?.sections.filter((x) => /^Pods/.test(x.label)).map((x) => <p key={x.label} className="small muted"><Md text={x.text} /></p>)}
        </>
      )}
    </div>
  );
}

function BattleCard({ crew, f, bf, set, update }: { crew: Crew; f: Fighter; bf: BattleFighter; set: (fn: (b: BattleFighter) => BattleFighter) => void; update: Update }) {
  const rules = getRules();
  const st = fighterStats(rules, crew, f);
  const down = isDown(rules, bf);
  const items = equipped(crew, f, rules);
  const hands = items.filter((o) => ['set1', 'set2', 'mount'].includes(o.slot) && o.def);
  const shield = items.some((o) => o.def?.kind === 'shield');
  const conds = conditionsFor(rules, f);
  const ending = rules.data.states;
  const spectacularCounts = activeEffects(rules, crew, 'afterBattle').find((e) => e.effect.per === 'spectacular');
  const onPutDown = activeEffects(rules, crew, 'putDown');
  return (
    <article className={`card bcard ${down ? 'is-down' : ''} ${bf.activated ? 'is-done' : ''}`}>
      <header className="row between gap-s wrap">
        <div>
          <strong>{fighterLabel(f)}</strong>{f.title ? <span className="muted"> "{f.title}"</span> : null}
          <div className="muted small">{describeType(f)} · Move {st.moveText} · Hands {st.hands} · Save {st.save ?? '–'}</div>
        </div>
        <select aria-label="Position" value={bf.position} onChange={(e) => set((x) => ({ ...x, position: e.target.value, states: positions(rules).find((p) => p.name === e.target.value)?.down ? [] : x.states }))}>
          {positions(rules).filter((p) => (!p.botOnly || isBot(rules, f)) && !(p.notBot && isBot(rules, f))).map((p) => <option key={p.name}>{p.name}</option>)}
        </select>
      </header>

      <div className="row gap-s wrap">
        <span className="small strong">Energy</span>
        <div className="pips" role="group" aria-label={`Energy ${bf.energy} of ${st.energy}`}>
          {Array.from({ length: st.energy }, (_, i) => (
            <button key={i} className={`epip ${i < bf.energy ? 'on' : ''}`} aria-label={`Set Energy to ${i + 1 === bf.energy ? i : i + 1}`}
              onClick={() => set((x) => ({ ...x, energy: i + 1 === x.energy ? i : i + 1 }))} />
          ))}
        </div>
        <span className="small">{bf.energy}/{st.energy}</span>
      </div>

      <div className="stack-s">
        <span className="small strong">States <RuleLink rule={{ title: 'States', section: '5.9', lines: ending.map((s) => [plain(s.State), `${s['What it does']}. Ends: ${s['When it ends']}`] as [string, string]) }}>§</RuleLink></span>
        <div className="seg wrap">
          {stateNames(rules).map((s) => (
            <button key={s} className={`seg-btn tight ${bf.states.includes(s) ? 'on' : ''}`} aria-pressed={bf.states.includes(s)} disabled={down} onClick={() => set((x) => toggleState(rules, x, s))}>{s}</button>
          ))}
        </div>
      </div>

      <div className="stack-s">
        <span className="small strong">Lasting conditions ({bf.conditions.length}/{rules.crew.battle.conditionsToDown.value} puts down)</span>
        <div className="seg wrap">
          {bf.conditions.map((c, i) => (
            <button key={i} className="seg-btn tight on cond" onClick={() => set((x) => ({ ...x, conditions: x.conditions.filter((_, j) => j !== i) }))} aria-label={`Clear ${c}`}>{conditionLabel(rules, f, c)} ✕</button>
          ))}
        </div>
        {!down && (
          <div className="seg wrap">
            {conds.map((c) => <button key={c} className="seg-btn tight ghost" onClick={() => set((x) => addCondition(rules, x, c))}>+ {conditionLabel(rules, f, c)}</button>)}
          </div>
        )}
        {down && <p className="small err-text">Down: face down, one action (crawl 1 inch). Can be carried, captured or rescued (5.8).</p>}
      </div>

      {(hands.length > 0 || f.builtIn) && (
        <ul className="plain-list small weapons">
          {hands.map((o) => (
            <li key={o.uid}><RuleLink rule={itemRule(rules, o.def!)}>{o.def!.name}</RuleLink>
              <span className="muted"> {o.slot === 'mount' ? 'mount' : o.slot === 'set1' ? 'set 1' : 'set 2'}{o.def!.rules.Range ? ` · ${o.def!.rules.Range}` : ''}{o.def!.traits.length ? ` · ${o.def!.traits.join(', ')}` : ''}</span></li>
          ))}
          {f.builtIn && rules.item(f.builtIn) && <li><RuleLink rule={itemRule(rules, rules.item(f.builtIn)!)}>{rules.item(f.builtIn)!.name}</RuleLink><span className="muted"> built in{rules.item(f.builtIn)!.rules.Range ? ` · ${rules.item(f.builtIn)!.rules.Range}` : ''}{rules.item(f.builtIn)!.traits.length ? ` · ${rules.item(f.builtIn)!.traits.join(', ')}` : ''}</span></li>}
        </ul>
      )}

      <div className="row gap-s wrap">
        {shield && (
          <span className="row gap-s small">Shield dents
            <button className="btn small" aria-label="One dent fewer" onClick={() => set((x) => ({ ...x, dents: Math.max(0, x.dents - 1) }))}>−</button>{bf.dents}
            <button className="btn small" aria-label="One more dent" onClick={() => set((x) => ({ ...x, dents: x.dents + 1 }))}>+</button>
          </span>
        )}
        <span className="row gap-s small">Put down
          <button className="btn small" aria-label="One fewer put down" onClick={() => set((x) => ({ ...x, putDowns: Math.max(0, x.putDowns - 1) }))}>−</button>{bf.putDowns}
          <button className="btn small" aria-label="One more put down" onClick={() => set((x) => ({ ...x, putDowns: x.putDowns + 1 }))}>+</button>
        </span>
        {spectacularCounts && (
          <span className="row gap-s small"><RuleLink rule={glossaryRule(rules, spectacularCounts.effect.term ?? '')}>{spectacularCounts.effect.term}</RuleLink> ({spectacularCounts.title})
            <button className="btn small" aria-label="One fewer spectacular hit" onClick={() => set((x) => ({ ...x, spectacular: Math.max(0, (x.spectacular ?? 0) - 1) }))}>−</button>{bf.spectacular ?? 0}
            <button className="btn small" aria-label="One more spectacular hit" onClick={() => set((x) => ({ ...x, spectacular: (x.spectacular ?? 0) + 1 }))}>+</button>
          </span>
        )}
      </div>

      {bf.putDowns > 0 && onPutDown.map((e) => <FactionNote key={e.effect.id} e={e} small />)}
      {down && activeEffects(rules, crew, 'allyDown').map((e) => <FactionNote key={e.effect.id} e={e} small />)}
      <Grenades crew={crew} f={f} bf={bf} set={set} />
      {hasGift(rules, crew, f) && (
        <details className="powers small">
          <summary>Psionic powers&nbsp;<span className="muted">(§ {rules.section('gift')})</span></summary>
          <ul className="plain-list stack-s">
            {powersFor(rules, f.species).map((p) => <li key={p.name}><strong>{p.name}</strong> <span className="badge">{p.number}</span> <Md text={p.text} /></li>)}
          </ul>
          <RuleLink rule={giftRule(rules, f.species)}>Using it, the drain and madness</RuleLink>
        </details>
      )}
      {hasGift(rules, crew, f) && !down && <Madness f={f} bf={bf} set={set} update={update} />}
      {isBot(rules, f) && (
        <div className="seg wrap">
          <span className="small strong">Bot <RuleLink rule={{ title: 'Bots and relays', section: '8.5', lines: rules.data.bot_states.map((x) => [plain(x.State), `${x['What it does']}. When: ${plain(x.When)}`] as [string, string]) }}>§</RuleLink></span>
          {rules.data.bot_states.map((x) => plain(x.State)).map((s) => (
            <button key={s} className={`seg-btn tight ${bf.states.includes(s) ? 'on' : ''}`} aria-pressed={bf.states.includes(s)} disabled={down} onClick={() => set((y) => ({ ...y, states: y.states.includes(s) ? y.states.filter((z) => z !== s) : [...y.states, s] }))}>{s}</button>
          ))}
        </div>
      )}
      {bf.word && (
        <div className="word small">
          <strong>Word:</strong> {wordName(rules, bf.word.deed)} ({bf.word.audience}) <DeedText id={bf.word.deed} audience={bf.word.audience} />
          <label className="check small"><input type="checkbox" checked={bf.word.result === 'fulfilled'} onChange={(e) => set((x) => ({ ...x, word: { ...x.word!, result: e.target.checked ? 'fulfilled' : undefined } }))} /> It is done</label>
        </div>
      )}

      <div className="row gap-s wrap">
        <button className={`btn small ${bf.activated ? '' : 'primary'}`} disabled={down && !bf.activated}
          onClick={() => set((x) => (x.activated ? { ...x, activated: false } : endActivation(rules, x)))}>{bf.activated ? 'Activated ✓' : 'End activation'}</button>
        <label className="check small"><input type="checkbox" checked={bf.reactionUsed} onChange={(e) => set((x) => ({ ...x, reactionUsed: e.target.checked }))} /> Reaction used</label>
      </div>
      <input className="small-input" placeholder="Notes (carrying a crate, jammed pistol…)" aria-label="Notes" value={bf.notes} onChange={(e) => set((x) => ({ ...x, notes: e.target.value }))} />
    </article>
  );
}

// ---------- tools ----------
const TOOLS = ['Dice', 'Hit', 'Clash', 'Gear fails', 'Grenade', 'Ask the voice', 'Quick reference', 'Glossary'];

function Tools({ crew, tool, setTool }: { crew: Crew; tool: string | null; setTool: (t: string | null) => void }) {
  return (
    <div className="tools card">
      <nav className="tabs small-tabs" role="tablist">
        {TOOLS.map((t) => <button key={t} role="tab" aria-selected={tool === t} className={`tab ${tool === t ? 'on' : ''}`} onClick={() => setTool(tool === t ? null : t)}>{t}</button>)}
      </nav>
      {tool === 'Dice' && <DiceTool />}
      {tool === 'Hit' && <HitTool />}
      {tool === 'Clash' && <ClashTool />}
      {tool === 'Ask the voice' && <VoiceTool crew={crew} />}
      {tool === 'Gear fails' && <><GearFailTool />{activeEffects(getRules(), crew, 'gearFail').map((e) => <FactionNote key={e.effect.id} e={e} small />)}</>}
      {tool === 'Grenade' && <GrenadeTool />}
      {tool === 'Quick reference' && <><QuickRef /><MoreTables /></>}
      {tool === 'Glossary' && <GlossaryTool />}
      {!tool && <p className="muted small">Dice, the consequence tables, clashes and the voices, for when the table needs them.</p>}
    </div>
  );
}

function DiceTool() {
  const rules = getRules();
  const [total, setTotal] = useState<number | null>(null);
  const shot = total !== null ? shotSeverity(rules, total) : null;
  return (
    <div className="stack-s">
      <PoolRoller onResult={(t) => setTotal(t)} label="Attack or test" />
      {total !== null && <p className="small">As a shot: {shot ?? 'a miss'} (3.4). As a test: {rules.data.difficulties.map((d) => `${plain(d.Difficulty)} ${total >= +d.Target ? '✓' : '✕'}`).join(' · ')}</p>}
      <div className="row gap-s wrap"><span className="small">Plain dice:</span><RollOrEnter die="d6" onResult={() => {}} label="d6" /></div>
    </div>
  );
}

function HitTool() {
  const rules = getRules();
  const tables = Object.keys(rules.data.consequences);
  const [table, setTable] = useState(tables[0]);
  const [lower, setLower] = useState(false);
  const [n, setN] = useState<number | null>(null);
  const [margin, setMargin] = useState('');
  const read = lower ? bandLower(rules, table) : table;
  const row = read && n !== null ? lookup(rules.data.consequences[read], n) : null;
  const fromMargin = margin ? severityOfMargin(rules.data.severity, +margin) : null;
  return (
    <div className="stack-s">
      <p className="small">Order of a hit (6.1): severity, weapon traits (Weak −1, Hits hard one band up), save (7, 9, 11), then the table. Higher is better on the tables.</p>
      <div className="row gap-s wrap">
        <label className="field"><span>Melee margin</span><input className="num" inputMode="numeric" value={margin} onChange={(e) => setMargin(e.target.value.replace(/\D/g, ''))} /></label>
        {fromMargin && <span className="small">→ <strong>{fromMargin}</strong></span>}
      </div>
      <div className="seg wrap" role="radiogroup" aria-label="Severity">
        {tables.map((t) => <button key={t} className={`seg-btn tight ${t === table ? 'on' : ''}`} aria-pressed={t === table} onClick={() => { setTable(t); setN(null); }}>{t}</button>)}
      </div>
      <label className="check small"><input type="checkbox" checked={lower} onChange={(e) => setLower(e.target.checked)} /> Read one band lower (Thick hide, 6.1)</label>
      {lower && !read ? <p className="small"><strong>No effect at all.</strong></p> : <RollOrEnter die="d6" value={n} onResult={setN} label="Consequence d6" />}
      {row && <p className="result"><strong>{read}:</strong> <Md text={row.Result} /></p>}
    </div>
  );
}

function ClashTool() {
  const rules = getRules();
  const [n, setN] = useState<number | null>(null);
  const all = useMemo(() => Object.entries(rules.data.clashes).flatMap(([k, rows]) => (rows as Record<string, string>[]).map((r) => ({ d66: r.d66, Result: r.Result, row: k }))), [rules]);
  const row = n !== null ? all.find((r) => +r.d66 === n) : null;
  return (
    <div className="stack-s">
      <p className="small">A tie in melee is a clash: roll a d66 (6.5). Rows 1 and 2 need base contact.</p>
      <RollOrEnter die="d66" value={n} onResult={setN} />
      {row && <p className="result"><strong>{row.row}, {row.d66}:</strong> <Md text={row.Result} /></p>}
    </div>
  );
}

function VoiceTool({ crew }: { crew: Crew }) {
  const rules = getRules();
  const voices = Object.keys(rules.data.voices);
  const fac = rules.faction(crew.faction ?? '');
  const own = fac ? voices.find((v) => plain(fac.voice).includes(v.replace(/\s*\(.*$/, ''))) : undefined;
  const [voice, setVoice] = useState(own ?? voices[0]);
  const [n, setN] = useState<number | null>(null);
  const v = rules.data.voices[voice];
  const row = n !== null ? lookup(v.rows, Math.max(1, Math.min(6, n))) : null;
  return (
    <div className="stack-s">
      <p className="small">Once per activation, before a roll, ask the voice of an item you hold, wear or are (8.6). <RuleLink rule={sectionRule('Ask the voice', '8.6', 'Humans: a natural 1 is rolled again once. A roll above 6 counts as 6, below 1 as 1. Drops have no voice.')}>More</RuleLink></p>
      <label className="field"><span>Voice{own ? '' : ' (choose: your faction prays to several)'}</span>
        <select value={voice} onChange={(e) => { setVoice(e.target.value); setN(null); }}>{voices.map((x) => <option key={x}>{x}</option>)}</select>
      </label>
      {activeEffects(rules, crew, 'voice').map((e) => <FactionNote key={e.effect.id} e={e} small />)}
      <p className="small"><Md text={v.intro} /></p>
      <RollOrEnter die="d6" value={n} onResult={setN} />
      {row && <p className={`result mark-${plain(row.Mark).toLowerCase()}`}><strong>{plain(row.Mark)}:</strong> <Md text={row.Result} /> → <Md text={row.Effect} /></p>}
      {row && /good/i.test(plain(row.Mark)) && activeEffects(rules, crew, 'voiceGood').map((e) => <FactionNote key={e.effect.id} e={e} small />)}
    </div>
  );
}

function QuickRef() {
  const rules = getRules();
  return (
    <div className="stack-s small">
      <h4>Difficulties (3.3)</h4>
      <ul className="plain-list">{rules.data.difficulties.map((d) => <li key={d.Difficulty}><strong>{plain(d.Difficulty)} {d.Target}</strong>: {d.Means}</li>)}</ul>
      <h4>Actions (5.2)</h4>
      <ul className="plain-list">{rules.data.actions.map((a) => <li key={a.Action}><Md text={a.Action} />: <Md text={a['What it does']} /></li>)}</ul>
      <h4>States (5.9)</h4>
      <ul className="plain-list">{rules.data.states.map((s) => <li key={s.State}><Md text={s.State} />: {s['What it does']}. <span className="muted">Ends: {s['When it ends']}</span></li>)}</ul>
      <h4>Psionic powers ({rules.section('gift')})</h4>
      <ul className="plain-list">
        {rules.data.gift_rules.map((g) => <li key={g.label}><strong>{g.label}.</strong> <MdBlock text={g.text} /></li>)}
        {rules.powers.map((p) => <li key={p.name}><strong>{p.name}</strong> ({p.number}): <Md text={p.text} /></li>)}
      </ul>
      <h4>Lasting conditions (6.3)</h4>
      <ul className="plain-list">{rules.data.lasting_conditions.map((c) => <li key={c.Condition}><Md text={c.Condition} /> <span className="muted">({plain(c['Bot name'])})</span>: <Md text={c['What it does']} /></li>)}</ul>
    </div>
  );
}

// ---------- the end ----------
function EndBattle({ crew, b, setB, update }: { crew: Crew; b: Battle; setB: SetB; update: Update }) {
  const rules = getRules();
  const fighters = crew.fighters.filter((f) => b.fighters[f.id]?.inBattle);
  return (
    <div className="stack">
      <div className="card stack-s">
        <h3>How did it end? <span className="section-tag">§ 9.5</span></h3>
        <label className="check"><input type="checkbox" checked={b.winCond} onChange={(e) => setB((x) => ({ ...x, winCond: e.target.checked }))} /> We met the winning condition (the prize: parts and a finds roll)</label>
        {b.winCond && (
          <label className="field"><span>Credited to (Did the job, 13.4)</span>
            <select value={b.didJob ?? ''} onChange={(e) => setB((x) => ({ ...x, didJob: e.target.value || null }))}>
              <option value="">Nobody in particular</option>
              {fighters.map((f) => <option key={f.id} value={f.id}>{fighterLabel(f)}</option>)}
            </select>
          </label>
        )}
        <label className="check"><input type="checkbox" checked={b.heldField} onChange={(e) => setB((x) => ({ ...x, heldField: e.target.checked }))} /> We held the field</label>
        <label className="check"><input type="checkbox" checked={!!b.evacuated} disabled={!!b.final} onChange={(e) => setB((x) => ({ ...x, evacuated: e.target.checked, stoodGround: e.target.checked ? false : !x.broke, heldField: e.target.checked ? false : x.heldField }))} /> We called our evac{b.final ? ' (no evac in the Final)' : ` (the enemy holds the field, takes the prize, and we gain ${rules.crew.afterBattle.evacTag.value}, 9.6)`}</label>
        <label className="check"><input type="checkbox" checked={!!b.broke} onChange={(e) => setB((x) => ({ ...x, broke: e.target.checked, stoodGround: e.target.checked ? false : !x.evacuated }))} /> We broke (9.4)</label>
        <label className="check"><input type="checkbox" checked={b.stoodGround} onChange={(e) => setB((x) => ({ ...x, stoodGround: e.target.checked }))} /> We stood our ground (did not evacuate or forfeit)</label>
      </div>
      <div className="card stack-s">
        <h3>Where everyone ended</h3>
        {fighters.map((f) => (
          <div key={f.id} className="row gap-s wrap between">
            <span>{fighterLabel(f)}</span>
            <select aria-label={`${fighterLabel(f)}: how they ended`} value={b.fighters[f.id].position} onChange={(e) => setB((x) => ({ ...x, fighters: { ...x.fighters, [f.id]: { ...x.fighters[f.id], position: e.target.value } } }))}>
              {positions(rules).filter((p) => (!p.botOnly || isBot(rules, f)) && !(p.notBot && isBot(rules, f))).map((p) => <option key={p.name}>{p.name}</option>)}
            </select>
          </div>
        ))}
        <p className="muted small">Down and left on the table rolls the harsh table unless you hold the field; evacuated or captured, the gentle one (13.2).</p>
      </div>
      <div className="row gap wrap">
        <button className="btn" onClick={() => setB((x) => ({ ...x, phase: 'playing' }))}>Back to the battle</button>
        <button className="btn primary" onClick={() => { update((c) => startAfterBattle(rules, c)); go(`/after/${crew.id}`); }}>After the battle →</button>
      </div>
    </div>
  );
}

// ---------- faction rules on the table ----------
export function FactionNote({ e, small, children }: { e: ActiveEffect; small?: boolean; children?: ReactNode }) {
  return (
    <div className={`faction-note ${small ? 'small' : ''}`}>
      <strong>{e.title}</strong> <span className="section-tag">({e.section})</span> <Md text={e.text} />
      {children}
    </div>
  );
}

function FactionSetup({ crew, b, setB, update }: { crew: Crew; b: Battle; setB: SetB; update: Update }) {
  const rules = getRules();
  const effects = activeEffects(rules, crew, 'setup');
  if (!effects.length) return null;
  return (
    <div className="card stack-s">
      <h3>Before deployment: {crew.faction}</h3>
      {effects.map((e) => (
        <FactionNote key={e.effect.id} e={e}>
          {e.effect.kind === 'nameEnemy' && (
            <input aria-label="The enemy fighter named" placeholder="Name the enemy fighter" value={b.mark ?? ''} onChange={(ev) => setB((x) => ({ ...x, mark: ev.target.value }))} />
          )}
          {e.effect.kind === 'payment' && (b.paid?.[e.effect.id]
            ? <span className="badge ok">Paid {e.effect.amount} parts</span>
            : <button className="btn small" disabled={!canSpend(rules, crew, e.effect.amount ?? 0) || crew.parts < (e.effect.amount ?? 0)} onClick={() => { update((c) => addLedger(c, -(e.effect.amount ?? 0), `${e.title}${b.opponent ? ` to ${b.opponent}` : ''}`)); setB((x) => ({ ...x, paid: { ...(x.paid ?? {}), [e.effect.id]: true } })); }}>Pay {e.effect.amount} parts</button>)}
          {e.effect.kind === 'research' && <ResearchPick b={b} setB={setB} />}
        </FactionNote>
      ))}
    </div>
  );
}

function ResearchPick({ b, setB }: { b: Battle; setB: SetB }) {
  const rules = getRules();
  const r = b.research ?? { field: null, lab: null, chosen: null, done: false };
  const set = (p: Partial<typeof r>) => setB((x) => ({ ...x, research: { ...r, ...p } }));
  const lists: ['field' | 'lab', Record<string, string>[], string][] = [['field', rules.data.research_studies.field, 'Field study'], ['lab', rules.data.research_studies.lab, 'Lab study']];
  return (
    <div className="stack-s research">
      {lists.map(([key, rows, col]) => {
        const n = r[key];
        const row = n !== null ? lookup(rows, n) : null;
        return (
          <div key={key} className="stack-s">
            <span className="small strong">{col}</span>
            <RollOrEnter die="d6" value={n} onResult={(v) => set({ [key]: v, chosen: r.chosen === key ? null : r.chosen } as Partial<typeof r>)} />
            {row && (
              <label className={`option ${r.chosen === key ? 'on' : ''}`}>
                <input type="radio" name="research" checked={r.chosen === key} onChange={() => set({ chosen: key })} />
                <span><Md text={row[col]} /></span>
              </label>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ResearchTracker({ crew, b, setB }: { crew: Crew; b: Battle; setB: SetB }) {
  const rules = getRules();
  const e = activeEffects(rules, crew, 'setup').find((x) => x.effect.kind === 'research');
  const r = b.research;
  if (!e || !r?.chosen) return null;
  const rows: Record<string, string>[] = r.chosen === 'field' ? rules.data.research_studies.field : rules.data.research_studies.lab;
  const col = r.chosen === 'field' ? 'Field study' : 'Lab study';
  const row = lookup(rows, r[r.chosen] ?? 0);
  return (
    <div className="card faction-note">
      <strong>{e.title}:</strong> <Md text={row?.[col] ?? ''} />
      <label className="check"><input type="checkbox" checked={r.done} onChange={(ev) => setB((x) => ({ ...x, research: { ...r, done: ev.target.checked } }))} /> Completed (+{e.effect.amount} XP to one {e.effect.eligibleTypes?.join(', ') ?? 'fighter'} who took part, after the battle)</label>
    </div>
  );
}

function RoundStart({ crew, b }: { crew: Crew; b: Battle }) {
  const rules = getRules();
  const [roll, setRoll] = useState<Record<string, number | null>>({});
  const cap = captainOf(crew);
  const capStanding = !!cap && !!b.fighters[cap.id]?.inBattle && !positionDef(rules, b.fighters[cap.id].position)?.down && !!positionDef(rules, b.fighters[cap.id].position)?.onTable;
  const es = activeEffects(rules, crew, 'roundStart').filter((e) => (!e.effect.rounds || e.effect.rounds.includes(b.round)) && (e.effect.captain !== 'standing' || capStanding));
  return (
    <>
      {es.map((e) => (
        <FactionNote key={e.effect.id} e={e} small>
          {e.effect.roll && <RollOrEnter die={e.effect.roll} value={roll[`${e.effect.id}-${b.round}`] ?? null} onResult={(n) => setRoll((x) => ({ ...x, [`${e.effect.id}-${b.round}`]: n }))} />}
        </FactionNote>
      ))}
    </>
  );
}

function RulesInForce({ crew }: { crew: Crew }) {
  const rules = getRules();
  const list = rulesInForce(rules, crew);
  if (!list.length) return null;
  return (
    <details className="card">
      <summary>{crew.faction} rules in force ({crew.subfaction})</summary>
      <ul className="plain-list stack-s small">{list.map((r) => <li key={r.title}><strong>{r.title}.</strong> <Md text={r.text} /></li>)}</ul>
    </details>
  );
}
