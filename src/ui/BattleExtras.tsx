// More of the battle companion: worlds and scenarios (11.1, 11.2, chapter 12), the Final (15.3),
// breaking tests (11.4), madness (8.4), grenades (7.6, 7.7) and the reference tables.
import { useState } from 'react';
import { getRules, plain } from '../data/rules';
import { breakingStatus, positionDef, underdogFor } from '../engine/battle';
import { activeEffects } from '../engine/faction';
import { cellCovers, lookup } from '../engine/dice';
import { equipped } from '../engine/crew';
import type { Battle, BattleFighter, Crew, Fighter } from '../engine/model';
import { Md, fighterLabel, type Update } from './common';
import { MdBlock } from './md';
import { PoolRoller, RollOrEnter } from './Dice';

type SetB = (fn: (b: Battle) => Battle) => void;

export const worldOf = (b: Battle) => getRules().data.worlds.find((w) => w.name === b.world);
export const scenarioOf = (b: Battle) => worldOf(b)?.scenarios.find((s) => s.name === b.scenario);

/** Before the battle: the world, the scenario, deployment and the table (11.1, 11.2), or the Final (15.3). */
export function WorldSetup({ crew, b, setB }: { crew: Crew; b: Battle; setB: SetB }) {
  const rules = getRules();
  const w = worldOf(b);
  const sc = scenarioOf(b);
  const dep = b.deploymentRoll ? lookup(rules.data.deployment, b.deploymentRoll) : null;
  const ts = rules.crew.battle.tableSize;
  const ours = Object.values(b.fighters).filter((f) => f.inBattle).length;
  const big = ours > ts.value || (b.opponentFighters ?? 0) > ts.value;
  const scenarioDeploy = sc?.sections.find((x) => /^Deployment/.test(x.label))?.text ?? '';
  const ownDeployment = scenarioDeploy && !/deployment table/i.test(scenarioDeploy);
  return (
    <div className="card stack-s">
      <h3>World and scenario <span className="section-tag">§ 11.1, 11.2</span></h3>
      <label className="check"><input type="checkbox" checked={!!b.final} onChange={(e) => setB((x) => ({ ...x, final: e.target.checked, scenario: e.target.checked ? '' : x.scenario }))} /> This is the season's Final (15.3)</label>
      {b.final && (
        <details className="small" open>
          <summary>The Final</summary>
          <ul className="plain-list stack-s">{rules.data.final.map((r) => <li key={r.label}><strong>{r.label}.</strong> <Md text={r.text} /></li>)}</ul>
        </details>
      )}
      <div className="row gap-s wrap">
        <label className="field"><span>World</span>
          <select value={b.world} onChange={(e) => setB((x) => ({ ...x, world: e.target.value, scenario: '' }))}>
            <option value="">Choose, or roll</option>{rules.data.worlds.map((x) => <option key={x.name}>{x.name}</option>)}
          </select>
        </label>
        <RollOrEnter die="d66" label="Roll the world" value={b.worldRoll ?? null} onResult={(n) => {
          const row = lookup(rules.data.world_table, n);
          setB((x) => ({ ...x, worldRoll: n, world: row ? plain(row.World) : x.world, scenario: '' }));
        }} />
      </div>
      {w && <p className="small"><strong>{w.name}:</strong> {w.ground}. <Md text={w.alwaysOn} /></p>}
      {w && !b.final && (
        <div className="row gap-s wrap">
          <label className="field"><span>Scenario</span>
            <select value={b.scenario ?? ''} onChange={(e) => setB((x) => ({ ...x, scenario: e.target.value }))}>
              <option value="">Choose, or roll</option>{w.battles.map((x) => <option key={x.name} value={x.name}>{x.d6}: {x.name}</option>)}
            </select>
          </label>
          <RollOrEnter die="d6" label="Roll the scenario" onResult={(n) => { const hit = w.battles.find((x) => cellCovers(x.d6, n)); if (hit) setB((x) => ({ ...x, scenario: hit.name })); }} />
        </div>
      )}
      {sc && <ScenarioPage b={b} />}
      <div className="row gap-s wrap">
        {b.final ? <span className="small"><strong>Deployment:</strong> {rules.crew.final.deployment.value} (15.3)</span>
          : ownDeployment ? <span className="small"><strong>Deployment:</strong> <Md text={scenarioDeploy} /></span>
          : <><span className="small strong">Deployment</span><RollOrEnter die="d6" label="Roll deployment" value={b.deploymentRoll ?? null} onResult={(n) => setB((x) => ({ ...x, deploymentRoll: n }))} /></>}
      </div>
      {!ownDeployment && !b.final && rules.crew.underdogs.picksDeployment?.value && underdogFor(rules, crew, b).underdog && (
        <p className="note small">{underdogFor(rules, crew, b).underdog === 'us' ? 'We are' : 'The opponent is'} the underdog: {underdogFor(rules, crew, b).underdog === 'us' ? 'we pick' : 'they pick'} the deployment result instead of rolling ({rules.crew.underdogs.picksDeployment.source}).</p>
      )}
      {dep && !ownDeployment && !b.final && <p className="small"><strong>{plain(dep.Deployment)}:</strong> <Md text={dep["Each side's zone"]} /></p>}
      <p className="small muted">Table: {big ? ts.large : ts.small} ({big ? 'a crew has more than' : 'neither crew has more than'} {ts.value} fighters). The first player is the higher of a d6 each. No fighter deploys within 6 inches of an enemy, a non-player model or a scenario item.</p>
      {crew && null}
    </div>
  );
}

function ScenarioPage({ b }: { b: Battle }) {
  const sc = scenarioOf(b);
  if (!sc) return null;
  return (
    <details className="scenario" open={b.phase === 'setup'}>
      <summary><strong>{sc.title}</strong></summary>
      {sc.lore && <p className="small muted"><em>{sc.lore}</em></p>}
      <dl className="stack-s small">{sc.sections.map((x, i) => (
        <div key={i}><dt className="strong">{x.label}</dt><dd className="scen-text"><MdBlock text={x.text} /></dd></div>
      ))}</dl>
    </details>
  );
}

/** On the table: the world's always-on rule, the scenario page, the round 3 event and the Final's spotlight. */
export function WorldPanel({ b, setB }: { b: Battle; setB: SetB }) {
  const rules = getRules();
  const w = worldOf(b);
  const R = rules.crew.battle.worldEventRound.value;
  const F = rules.crew.final;
  const ev = b.eventRoll ? lookup(w?.events ?? [], b.eventRoll) : null;
  if (!w && !b.final) return null;
  return (
    <div className="stack-s">
      {w && <p className="small faction-note"><strong>{w.name}.</strong> <Md text={w.alwaysOn} /></p>}
      {w && b.round === R && (
        <div className="note stack-s">
          <span className="small">Start of round {R}: the {w.name} event (d6, 11.1).</span>
          <RollOrEnter die="d6" value={b.eventRoll ?? null} onResult={(n) => setB((x) => ({ ...x, eventRoll: n }))} />
          {ev && <p className="small"><Md text={ev.Event} /></p>}
        </div>
      )}
      {b.final && b.round >= F.spotlightFrom.value && <p className="small note"><Md text={rules.data.final.find((r) => /spotlight/i.test(r.label))?.text ?? ''} /></p>}
      {b.scenario && <ScenarioPage b={b} />}
    </div>
  );
}

/** Breaking (11.4): when the crew must test, who tests, the dice, and the result. */
export function BreakingCard({ crew, b, setB }: { crew: Crew; b: Battle; setB: SetB }) {
  const rules = getRules();
  const effects = activeEffects(rules, crew, 'breaking').map((e) => ({ ...e.effect, title: e.title }));
  const s = breakingStatus(rules, crew, b, effects);
  const br = rules.crew.battle.breaking;
  const key = String(b.round);
  const done = b.breakingTests?.[key];
  if (!s.needed || b.broke) return null;
  return (
    <div className="note stack-s breaking">
      <strong>Breaking test ({br.source})</strong>
      <span className="small">{s.out} of {s.total} fighters are down, captured or gone (the test starts at {s.threshold}).</span>
      {s.never ? <span className="small">Only bots stand: the operators hold their nerve. No test.</span> : done !== undefined ? (
        <span className={`badge ${done ? 'ok' : 'err'}`}>{done ? 'Held this round' : 'Broke'}</span>
      ) : (
        <>
          <span className="small">{fighterLabel(s.tester!)} tests: {br.rating} {s.dice >= 0 ? '+' : ''}{s.dice} dice{s.notes.length ? ` (${s.notes.join(', ')})` : ''}, Routine ({br.target}).</span>
          <PoolRoller key={key} initialExtra={s.dice} target={br.target} />
          <div className="seg">
            <button className="seg-btn tight" onClick={() => setB((x) => ({ ...x, breakingTests: { ...(x.breakingTests ?? {}), [key]: true } }))}>Passed</button>
            <button className="seg-btn tight" onClick={() => setB((x) => ({ ...x, breakingTests: { ...(x.breakingTests ?? {}), [key]: false }, broke: true, stoodGround: false, phase: 'ended', log: [...x.log, { round: x.round, text: 'The crew broke' }] }))}>Failed: the crew breaks</button>
          </div>
        </>
      )}
    </div>
  );
}

/** A gifted fighter's madness roll (8.4): Frenzied for the day, or Cracked for good. */
export function Madness({ f, bf, set, update }: { f: Fighter; bf: BattleFighter; set: (fn: (x: BattleFighter) => BattleFighter) => void; update: Update }) {
  const rules = getRules();
  const M = rules.crew.battle.madness;
  const [open, setOpen] = useState(false);
  const [n, setN] = useState<number | null>(null);
  const frenzied = bf.states.includes(M.value);
  return (
    <div className="stack-s">
      <div className="row gap-s wrap">
        {frenzied ? <span className="badge err">{M.value}</span> : <button className="btn small" onClick={() => setOpen(!open)}>Madness (kept {rules.crew.dice.badKeptTotal.value} or less)</button>}
        {(f.marks ?? []).includes(M.trait) && <span className="badge warn">{M.trait}</span>}
      </div>
      {open && !frenzied && (
        <div className="row gap-s wrap">
          <RollOrEnter die="d6" value={n} onResult={(v) => {
            setN(v);
            set((x) => ({ ...x, states: Array.from(new Set([...x.states, M.value])) }));
            if (cellCovers(M.cracked, v)) update((c) => ({ ...c, fighters: c.fighters.map((y) => (y.id === f.id ? { ...y, marks: Array.from(new Set([...(y.marks ?? []), M.trait])), titles: Array.from(new Set([...y.titles, M.title])), title: y.title || M.title } : y)) }));
          }} />
          {n !== null && <span className="small">{cellCovers(M.cracked, n) ? `${M.trait} for good ("${M.title}"), and ${M.value}` : `${M.value} for the rest of the battle`} (8.4)</span>}
        </div>
      )}
    </div>
  );
}

/** Grenades used this battle: a pair has two; used ones are gone after the battle (7.6). */
export function Grenades({ crew, f, bf, set }: { crew: Crew; f: Fighter; bf: BattleFighter; set: (fn: (x: BattleFighter) => BattleFighter) => void }) {
  const rules = getRules();
  const su = rules.crew.gear.singleUse;
  const items = equipped(crew, f, rules).filter((o) => o.def && su.value.includes(o.def.kind));
  if (!items.length) return null;
  return (
    <div className="row gap-s wrap">
      {items.map((o) => {
        const left = su.uses - (o.used ?? 0) - (bf.thrown?.[o.uid] ?? 0);
        return (
          <span key={o.uid} className="row gap-s small">{o.def!.name}: {left} left
            <button className="btn small" disabled={left <= 0} onClick={() => set((x) => ({ ...x, thrown: { ...(x.thrown ?? {}), [o.uid]: (x.thrown?.[o.uid] ?? 0) + 1 } }))}>Throw</button>
            {(bf.thrown?.[o.uid] ?? 0) > 0 && <button className="link small" onClick={() => set((x) => ({ ...x, thrown: { ...(x.thrown ?? {}), [o.uid]: Math.max(0, (x.thrown?.[o.uid] ?? 0) - 1) } }))}>undo</button>}
          </span>
        );
      })}
    </div>
  );
}

// ---------- tools ----------
export function GearFailTool() {
  const rules = getRules();
  const [rolls, setRolls] = useState<Record<string, number | null>>({});
  return (
    <div className="stack-s">
      <p className="small">A Strange item fails its know-how test, an Unreliable item bodges (kept 2), or a weird grenade lands (7.7).</p>
      {Object.entries(rules.data.gear_failure).map(([k, rows]) => {
        const n = rolls[k] ?? null;
        const row = n !== null ? lookup(rows, n) : null;
        return (
          <div key={k} className="stack-s">
            <strong className="small">{k.replace(/\.$/, '')}</strong>
            <RollOrEnter die="d6" value={n} onResult={(v) => setRolls((x) => ({ ...x, [k]: v }))} />
            {row && <p className="result small"><Md text={row.Result} /></p>}
          </div>
        );
      })}
    </div>
  );
}

export function GrenadeTool() {
  const rules = getRules();
  const g = rules.crew.gear.grenadeDistance;
  const [dir, setDir] = useState<number | null>(null);
  const [dist, setDist] = useState<number | null>(null);
  const [shoot, setShoot] = useState(0);
  const [copy, setCopy] = useState(false);
  const [blind, setBlind] = useState(false);
  const row = dir !== null ? lookup(rules.data.grenade_scatter, dir) : null;
  const base = dist !== null ? Object.entries(g.value).find(([k]) => cellCovers(k, dist))?.[1] ?? 0 : null;
  const total = base === null ? null : Math.max(0, base + (copy ? g.copyExtra : 0) + (blind ? g.blindExtra : 0) - shoot);
  return (
    <div className="stack-s">
      <p className="small">A grenade always scatters: a direction die and a distance die, minus the thrower's Shoot (7.6).</p>
      <div className="row gap-s wrap">
        <label className="field inline-field"><span className="small">Thrower's Shoot</span>
          <select value={shoot} onChange={(e) => setShoot(+e.target.value)}>{[0, 1, 2, 3].map((n) => <option key={n}>{n}</option>)}</select></label>
        <label className="check small"><input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} /> Copy grenade (+{g.copyExtra})</label>
        <label className="check small"><input type="checkbox" checked={blind} onChange={(e) => setBlind(e.target.checked)} /> Thrown blind (+{g.blindExtra})</label>
      </div>
      <span className="small strong">Direction</span><RollOrEnter die="d6" value={dir} onResult={setDir} />
      <span className="small strong">Distance</span><RollOrEnter die="d6" value={dist} onResult={setDist} />
      {row && total !== null && <p className="result"><strong>{plain(row['The grenade lands'])}</strong>, {total} inch{total === 1 ? '' : 'es'} from the point{total === 0 ? ' (right on it)' : ''}.</p>}
    </div>
  );
}

export function GlossaryTool() {
  const rules = getRules();
  const [q, setQ] = useState('');
  const list = rules.data.glossary.filter((g) => !q || plain(g.Term).toLowerCase().includes(q.toLowerCase()) || g.Meaning.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="stack-s">
      <input type="search" aria-label="Search the glossary" placeholder="Search: Announced, clash, Hacked…" value={q} onChange={(e) => setQ(e.target.value)} />
      <dl className="glossary small">{list.map((g) => <div key={g.Term}><dt><Md text={g.Term} /> <span className="section-tag">{g.See}</span></dt><dd><Md text={g.Meaning} /></dd></div>)}</dl>
    </div>
  );
}

/** The battle tables of Appendix B that the quick reference did not have. */
export function MoreTables() {
  const rules = getRules();
  const D = rules.data;
  const table = (title: string, rows: Record<string, string>[], section: string) => (
    <details key={title}>
      <summary>{title} <span className="section-tag">§ {section}</span></summary>
      <table className="tbl small">
        <thead><tr>{Object.keys(rows[0]).map((k) => <th key={k}>{k}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{Object.values(r).map((v, j) => <td key={j}><Md text={v} /></td>)}</tr>)}</tbody>
      </table>
    </details>
  );
  return (
    <div className="stack-s">
      {table('Melee results', D.melee_results, '5.6')}
      {table('Extra dice in melee', D.melee_dice, '5.6')}
      {table('Shot totals', D.shot_results, '5.7')}
      {table('Helps the shooter', D.shooting_helps, '5.7')}
      {table('Protects the target', D.shooting_protects, '5.7')}
      {table('Reactions', D.reactions, '5.8')}
      {table('Force fields', D.force_field_saves, '5.9')}
      {table('Terrain traits', D.terrain_traits, '5.11')}
      {table('Doors and windows', D.doors, '5.11')}
      {table('What can be prompted', D.prompt_targets, '8.2')}
      {table('Grenade scatter', D.grenade_scatter, '7.6')}
      {table('Non-player models', D.npm, '11.8')}
    </div>
  );
}

/** Where a fighter ended up, for the end-of-battle questions. */
export const isGone = (b: Battle, fid: string) => { const p = positionDef(getRules(), b.fighters[fid]?.position ?? ''); return !p?.onTable; };
