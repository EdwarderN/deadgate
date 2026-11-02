// Fighter cards and crew roster, laid out like Appendix C. Black and white friendly.
import { useEffect, useState } from 'react';
import { getRules } from '../data/rules';
import { advancesEarned, captainOf, captainTraitNames, currentRatings, equipped, fighterStats, hasGift, hasRites, partsLeft, ratingNames, ritesKnown, traitBudgetUsed } from '../engine/crew';
import type { Crew, Fighter } from '../engine/model';
import { describeType, fighterLabel } from './common';
import { Md } from './md';
import { powersFor } from './rule';

export function PrintView({ crew }: { crew: Crew }) {
  const [paper, setPaper] = useState<'A4' | 'letter'>(() => (navigator.language === 'en-US' ? 'letter' : 'A4'));
  const [what, setWhat] = useState<'both' | 'cards' | 'roster'>('both');
  useEffect(() => { document.title = `${crew.name || 'Crew'}: cards and roster`; }, [crew.name]);
  return (
    <div className="print-view">
      <style>{`@page { size: ${paper}; margin: 10mm; }`}</style>
      <div className="no-print row gap wrap print-controls">
        <a className="btn" href={`#/crew/${crew.id}`}>Back to the crew</a>
        <label className="field"><span>Paper</span>
          <select value={paper} onChange={(e) => setPaper(e.target.value as 'A4' | 'letter')}><option value="A4">A4</option><option value="letter">US Letter</option></select>
        </label>
        <label className="field"><span>Print</span>
          <select value={what} onChange={(e) => setWhat(e.target.value as typeof what)}><option value="both">Cards and roster</option><option value="cards">Fighter cards</option><option value="roster">Crew roster</option></select>
        </label>
        <button className="btn primary" onClick={() => window.print()}>Print</button>
      </div>
      {what !== 'roster' && <div className="sheet cards">{crew.fighters.map((f) => <FighterCard key={f.id} crew={crew} fighter={f} />)}</div>}
      {what !== 'cards' && <Roster crew={crew} />}
    </div>
  );
}

const Lines = ({ items, n }: { items: string[]; n: number }) => (
  <>{Array.from({ length: Math.max(n, items.length) }, (_, i) => <span key={i} className="ul">{items[i] ?? ''}</span>)}</>
);

function FighterCard({ crew, fighter: f }: { crew: Crew; fighter: Fighter }) {
  const rules = getRules();
  const st = fighterStats(rules, crew, f);
  const r = currentRatings(rules, f);
  const items = equipped(crew, f, rules);
  const names = (slot: string) => items.filter((o) => o.slot === slot).map((o) => `${o.def?.name ?? '?'}${o.def?.source === 'copy' ? ' (c)' : o.def?.source === 'drop' ? ' (d)' : ''}`);
  const sp = rules.species.find((s) => s.name === f.species);
  const typeTrait = rules.faction(crew.faction ?? '')?.types.find((t) => t.name === f.type);
  const speciesTraits = [sp ? `${sp.name}: ${strip(sp.trait).split('.')[0]}` : '', typeTrait ? `${typeTrait.name}: ${strip(typeTrait.trait).split('.')[0]}` : ''].filter(Boolean);
  const marks = f.marks ?? [];
  const budget = [
    ...captainTraitNames(f),
    ...f.advances.filter((a) => a.kind === 'trait' && !a.retired).map((a) => (a as { name: string }).name),
    ...f.legends.filter((l) => !l.retired).map((l) => l.name),
  ];
  const ratingAdv = f.advances.filter((a) => a.kind === 'rating' || a.kind === 'ace').length;
  const silly = f.sillyTrait ? `${f.sillyTrait}${rules.silly.find((s) => s.name === f.sillyTrait)?.title ? ` ("${rules.silly.find((s) => s.name === f.sillyTrait)!.title}")` : ''}` : '';
  const shield = items.some((o) => o.def?.kind === 'shield');
  const gift = [hasGift(rules, crew, f) ? 'The gift' : '', hasRites(rules, crew, f) ? `Rites: ${ritesKnown(rules, f).join(', ')}` : ''].filter(Boolean).join('; ');
  const th = rules.thresholds(Math.max(5, advancesEarned(rules, f.xp) + 1)).slice(0, 5);
  const titles = Array.from(new Set([f.title, ...f.titles, ...f.legends.map((l) => l.title ?? '')].filter(Boolean)));
  const ended = ['standing', 'evacuated', 'down', 'captured'];
  return (
    <div className="fcard">
      <div className="fc-row fc-top">
        <span className="fl w3"><b>Name</b> {f.name}{f.id === crew.captainId ? ' (captain)' : ''}</span>
        <span className="fl w2"><b>Title</b> {f.title}</span>
        <span className="fl w15"><b>Species</b> {f.species}</span>
        <span className="fl w15"><b>Type</b> {f.type ?? ''}</span>
      </div>
      <div className="fc-body">
        <div className="fc-col1">
          <div className="fc-stats">
            <span className="box"><b>Move</b>{st.moveText}</span>
            <span className="box"><b>Hands</b>{st.hands}</span>
            <span className="box"><b>Save</b>{st.save === null ? '–' : st.save}</span>
          </div>
          <table className="fc-rat"><thead><tr>{ratingNames(rules).map((n) => <th key={n}>{n}</th>)}</tr></thead><tbody><tr>{ratingNames(rules).map((n) => <td key={n}>{r[n]}</td>)}</tr></tbody></table>
          <div className="fc-line"><b>Energy</b> {Array.from({ length: rules.crew.gear.battery.value.militaryFrame }, (_, i) => <span key={i} className={`pip ${i >= st.energy ? 'dash' : ''}`} />)} <i>military frame</i></div>
          <div className="fc-line"><b>Shield</b> <span className={`pip round ${shield ? '' : 'dash'}`} /><span className={`pip round ${shield ? '' : 'dash'}`} /> <i>dents</i></div>
          <div className="fc-line"><b>Gift, rites</b><span className="ul">{gift}</span></div>
          <div className="fc-line small"><i>{crew.faction}{crew.subfaction ? `, ${crew.subfaction}` : ''}</i></div>
        </div>
        <div className="fc-col2">
          <div className="fc-h">Gear</div>
          <div className="fc-line"><b>Hands</b><span className="ul">{names('set1').join(' + ')}</span><span className="ul">{names('set2').join(' + ')}</span></div>
          {f.builtIn && <div className="fc-line"><b>Built in</b><span className="ul">{rules.item(f.builtIn)?.name} (c)</span></div>}
          <div className="fc-line"><b>Body</b><span className="ul">{names('body').join(', ')}</span></div>
          <div className="fc-line"><b>Frame</b><span className="ul">{[...names('frame'), ...names('mount').map((n) => `mount: ${n}`)].join(', ')}</span></div>
          <div className="fc-line"><b>Belt</b><Lines items={names('belt')} n={rules.crew.gear.beltSlots.value} /></div>
          <div className="fc-line"><b>Carried</b><span className="ul">{names('fitted').join(', ')}</span></div>
        </div>
        <div className="fc-col3">
          <div className="fc-h">Species and type traits</div>
          <div className="fc-line small">{[...speciesTraits, ...marks].join('. ')}</div>
          <div className="fc-h">Advances, Legends, captain traits <i>({traitBudgetUsed(f)}/{rules.crew.limits.traitBudget.value})</i></div>
          <div className="fc-grid2"><Lines items={budget} n={rules.crew.limits.traitBudget.value + 1} /></div>
          {ratingAdv > 0 && <div className="fc-line small">Rating advances: {ratingAdv}</div>}
          <div className="fc-h">Lasting injuries <i>({rules.crew.limits.maxLastingInjuries.value})</i></div>
          <div className="fc-line"><Lines items={f.injuries} n={rules.crew.limits.maxLastingInjuries.value} /></div>
        </div>
      </div>
      {hasGift(rules, crew, f) && (
        <div className="fc-powers">
          <div className="fc-h">Psionic powers <i>(§ {rules.section('gift')}{rules.data.gift_rules.filter((g) => g.label.includes(':')).map((g) => `; ${g.label}`).join('')})</i></div>
          <ul>{powersFor(rules, f.species).map((p) => <li key={p.name}><b>{p.name.replace(/\s*\(.+? only\)/, '')}</b> <i>{p.number}</i>: <Md text={p.text} /></li>)}</ul>
        </div>
      )}
      <div className="fc-foot">
        <div className="fc-line"><b>XP</b><span className="box sm">{f.xp}</span> {th.map((t) => <span key={t} className="thr">{t} <span className={`pip ${f.xp >= t ? 'fill' : ''}`} /></span>)} <b className="gap">Ended</b> {ended.map((e) => <span key={e} className="thr"><span className="pip" /> {e}</span>)}</div>
        <div className="fc-line"><b>Word</b><span className="ul">{f.word}</span><b>Silly trait</b><span className="ul">{silly}</span></div>
        <div className="fc-line"><b>Titles</b><span className="ul">{titles.join(', ')}</span><b>Past</b><span className="ul">{f.past}{f.rumour?.name && f.rumour.name !== f.past ? ` (rumour: ${f.rumour.name})` : ''}</span></div>
        <div className="fc-line"><b>History</b><span className="ul">{f.history.slice(-2).join(' / ')}</span></div>
      </div>
    </div>
  );
}

function Roster({ crew }: { crew: Crew }) {
  const rules = getRules();
  const cap = captainOf(crew);
  const total = crew.notes.season.reduce((a, s) => a + (s.points || 0), 0);
  const rows = Array.from({ length: rules.crew.limits.maxFighters.value }, (_, i) => crew.fighters[i]);
  const blank = (n: number, have: number) => Array.from({ length: Math.max(0, n - have) }, (_, i) => <div key={`b${i}`} className="ul-line" />);
  return (
    <div className="sheet roster">
      <div className="ro-title">Crew Roster</div>
      <div className="fc-row">
        <span className="fl w3"><b>Crew name</b> {crew.name}</span>
        <span className="fl w2"><b>Faction</b> {crew.faction}</span>
        <span className="fl w2"><b>Subfaction</b> {crew.subfaction}</span>
        <span className="fl w15"><b>Tape colour</b> {crew.tape}</span>
      </div>
      <div className="fc-row">
        <span className="fl w15"><b>Parts</b> {partsLeft(rules, crew)}</span>
        <span className="fl w2"><b>Captain</b> {cap ? fighterLabel(cap) : ''}</span>
        <span className="fl w3"><b>Captain trait(s)</b> {cap ? captainTraitNames(cap).join(', ') : ''}</span>
        <span className="fl w15"><b>Battles, league points</b> {crew.notes.season.length}, {total}</span>
      </div>
      <table className="ro-tab">
        <thead><tr><th>#</th><th>Fighter</th><th>Species, type</th><th>XP</th><th>Advances</th><th>Status (Sore, Laid up)</th><th>Task this break</th></tr></thead>
        <tbody>
          {rows.map((f, i) => (
            <tr key={i}><td>{i + 1}</td><td>{f ? `${fighterLabel(f)}${f.title ? ` "${f.title}"` : ''}` : ''}</td><td>{f ? describeType(f) : ''}</td><td>{f?.xp ?? ''}</td><td>{f ? f.advances.length : ''}</td>
              <td>{f && f.status !== rules.crew.campaign.statuses.value[0] ? f.status : ''}</td><td /></tr>
          ))}
        </tbody>
      </table>
      <div className="ro-grid">
        <div className="ro-box"><div className="fc-h">Tags <i>({rules.crew.limits.maxTags.value}: {rules.tags.map((t) => t.name).join(', ')})</i></div>{crew.notes.tags.map((t) => <div key={t} className="ul-line">{t}</div>)}{blank(3, crew.notes.tags.length)}</div>
        <div className="ro-box"><div className="fc-h">Contacts <i>({rules.crew.limits.maxContacts.value}, each used once)</i></div>{crew.notes.contacts.map((c, i) => <div key={i} className="ul-line">{c.used ? <s>{c.name}</s> : c.name}</div>)}{blank(3, crew.notes.contacts.length)}</div>
        <div className="ro-box"><div className="fc-h">Rivals</div>{crew.notes.rivals.map((r, i) => <div key={i} className="ul-line">{r}</div>)}{blank(3, crew.notes.rivals.length)}</div>
        <div className="ro-box"><div className="fc-h">Rumour about the crew <i>(1)</i></div><div className="ul-line">{crew.notes.rumour}</div>
          <div className="fc-h">Stash (items not carried)</div>
          <div className="ul-line">{crew.items.filter((o) => !o.fighterId).map((o) => rules.item(o.itemId)?.name).join(', ')}</div><div className="ul-line">{crew.notes.stash}</div></div>
      </div>
      <div className="ro-box wide"><div className="fc-h">The roll: the dead, the Taken, and their titles</div>{crew.notes.roll.map((r) => <div key={r.id} className="ul-line">{r.name}{r.titles ? ` (${r.titles})` : ''}: {r.fate}{r.note ? `. ${r.note}` : ''}</div>)}{blank(3, crew.notes.roll.length)}</div>
      <div className="ro-box wide"><div className="fc-h">Season log: battle, world, opponent, winning condition, held the field, story event, league points</div>
        {crew.notes.season.map((s) => <div key={s.id} className="ul-line">{[s.battle, s.world, s.opponent, s.winCond, s.heldField, s.story, `${s.points} pts`].filter(Boolean).join(' · ')}</div>)}{blank(4, crew.notes.season.length)}</div>
    </div>
  );
}

const strip = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1');
