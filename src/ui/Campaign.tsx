import { useEffect, useMemo, useState } from 'react';
import { getRules } from '../data/rules';
import {
  addLedger, advancesEarned, airTax, captainOf, captainTraitNames, currentRatings, hasGift, hasRites, isBot, ratingNames, riteFromAdvance, ritesKnown,
  strength, traitBudgetUsed, underdog,
} from '../engine/crew';
import { uid, type Advance, type Crew, type Fighter } from '../engine/model';
import { validate, type Message } from '../engine/validate';
import { crewToJson, download, fileName, shareLink } from '../store';
import { go } from '../App';
import { Equip, Hire, Messages, PartsCounter, Shop, Stash, describeType, fighterLabel, patchFighter, type Update } from './common';
import { copyLink, useAsk } from './confirm';
import { RuleLink, advanceRule, captainRule, contactRule, giftRule, injuryRule, legendRule, ritesRule, sillyRule, speciesRule, tagRule, typeRule } from './rule';

const TABS = ['Fighters', 'Shop and hire', 'Parts', 'Roster notes', 'Season', 'Underdogs'] as const;
type Tab = (typeof TABS)[number];

export function Campaign({ crew, update }: { crew: Crew; update: Update }) {
  const ask = useAsk();
  const rules = getRules();
  const [tab, setTab] = useState<Tab>('Fighters');
  const messages = useMemo(() => validate(rules, crew), [rules, crew]);
  const errors = messages.filter((m) => m.level === 'error');
  const link = shareLink(crew);
  useEffect(() => { document.title = `${crew.name || 'Crew'} · Dead Gate crew builder`; }, [crew.name]);
  return (
    <div className="campaign">
      <div className="build-head">
        <div>
          <h1 className="crew-title" style={{ borderBottomColor: crew.tape || undefined }}>{crew.name || 'Unnamed crew'}</h1>
          <p className="muted small">{crew.faction}, {crew.subfaction} · {crew.fighters.length} fighters · captain {captainOf(crew)?.name || 'none'}</p>
          {errors.length ? <span className="badge err">{errors.length} to fix</span> : <span className="badge ok">Legal</span>}
        </div>
        <PartsCounter crew={crew} />
      </div>
      <div className="row gap-s wrap actions">
        {crew.after ? <button className="btn small primary" onClick={() => go(`/after/${crew.id}`)}>Continue after the battle</button>
          : <button className="btn small primary" onClick={() => go(`/battle/${crew.id}`)}>{crew.battle ? 'Back to the battle' : 'Battle companion'}</button>}
        <button className="btn small" onClick={() => go(`/print/${crew.id}`)}>Print cards and roster</button>
        <button className="btn small" onClick={() => download(fileName(crew), crewToJson(crew))}>Export file</button>
        {link && <button className="btn small" onClick={() => copyLink(ask, link)}>Copy share link</button>}
      </div>
      <nav className="tabs" role="tablist" aria-label="Crew sections">
        {TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
      </nav>
      <div role="tabpanel">
        {tab === 'Fighters' && <FightersTab crew={crew} update={update} messages={messages} />}
        {tab === 'Shop and hire' && <div className="stack"><Stash crew={crew} update={update} /><Shop crew={crew} update={update} /><Hire crew={crew} update={update} /></div>}
        {tab === 'Parts' && <PartsTab crew={crew} update={update} />}
        {tab === 'Roster notes' && <NotesTab crew={crew} update={update} messages={messages.filter((m) => m.step === 'notes')} />}
        {tab === 'Season' && <SeasonTab crew={crew} update={update} />}
        {tab === 'Underdogs' && <UnderdogTab crew={crew} />}
      </div>
      {tab !== 'Fighters' && <Messages messages={messages.filter((m) => !m.fighterId)} />}
    </div>
  );
}

// ---------- fighters ----------
function FightersTab({ crew, update, messages }: { crew: Crew; update: Update; messages: Message[] }) {
  const [open, setOpen] = useState<string | null>(crew.fighters[0]?.id ?? null);
  return (
    <div className="stack">
      <Messages messages={messages.filter((m) => !m.fighterId)} />
      {crew.fighters.map((f) => (
        <FighterPanel key={f.id} crew={crew} fighter={f} update={update} open={open === f.id} toggle={() => setOpen(open === f.id ? null : f.id)} messages={messages.filter((m) => m.fighterId === f.id)} />
      ))}
    </div>
  );
}

function FighterPanel({ crew, fighter: f, update, open, toggle, messages }: { crew: Crew; fighter: Fighter; update: Update; open: boolean; toggle: () => void; messages: Message[] }) {
  const ask = useAsk();
  const rules = getRules();
  const set = (p: Partial<Fighter>) => patchFighter(update, f.id, (x) => ({ ...x, ...p }));
  const r = currentRatings(rules, f);
  const earned = advancesEarned(rules, f.xp);
  const pending = earned - f.advances.length;
  const errs = messages.filter((m) => m.level === 'error').length;
  const statuses = rules.crew.campaign.statuses.value;
  return (
    <article className={`card fighter-panel ${open ? 'open' : ''}`}>
      <button className="panel-head" onClick={toggle} aria-expanded={open}>
        <span>
          <strong>{fighterLabel(f)}{f.title ? ` "${f.title}"` : ''}</strong>
          {f.id === crew.captainId && <span className="badge">Captain</span>}
          {f.status !== statuses[0] && <span className="badge warn">{f.status}</span>}
          {pending > 0 && <span className="badge ok">{pending} advance{pending > 1 ? 's' : ''} to take</span>}
          {errs > 0 && <span className="badge err">{errs} to fix</span>}
        </span>
        <span className="muted small">{describeType(f)} · {f.xp} XP · {ratingNames(rules).map((n) => `${n[0]}${r[n]}`).join(' ')}</span>
      </button>
      {open && (
        <div className="panel-body stack">
          <Messages messages={messages} />
          <div className="row gap wrap">
            <label className="field grow"><span>Name</span><input value={f.name} onChange={(e) => set({ name: e.target.value })} /></label>
            <label className="field"><span>Title shown</span>
              <select value={f.title} onChange={(e) => set({ title: e.target.value })}>
                <option value="">None</option>
                {availableTitles(f).map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label className="field"><span>Status</span>
              <select value={f.status} onChange={(e) => set({ status: e.target.value })}>{statuses.map((s) => <option key={s}>{s}</option>)}</select>
            </label>
          </div>
          <p className="small">
            <RuleLink rule={speciesRule(rules, f.species)}>{f.species}</RuleLink>
            {f.type && <> · <RuleLink rule={typeRule(rules, crew.faction, f.type)}>{f.type}</RuleLink></>}
            {hasGift(rules, crew, f) && <> · <RuleLink rule={giftRule(rules)}>The gift</RuleLink></>}
            {hasRites(rules, crew, f) && <> · <RuleLink rule={ritesRule(rules)}>Rites</RuleLink>: {ritesKnown(rules, f).join(', ') || 'none chosen'}</>}
          </p>
          {f.id !== crew.captainId && (
            <button className="btn small" onClick={async () => { if (await ask(`Make ${fighterLabel(f)} the captain? A new captain takes one captain trait free (11.2).`)) update((c) => ({ ...c, captainId: f.id })); }}>Make captain</button>
          )}
          <Experience crew={crew} fighter={f} update={update} />
          <Injuries crew={crew} fighter={f} update={update} />
          <Character fighter={f} set={set} />
          <h4>Gear</h4>
          <Equip crew={crew} fighter={f} update={update} />
          <RemoveFighter crew={crew} fighter={f} update={update} />
        </div>
      )}
    </article>
  );
}

function availableTitles(f: Fighter): string[] {
  const rules = getRules();
  const t = new Set<string>(f.titles);
  for (const l of f.legends) if (l.title) t.add(l.title);
  for (const i of f.injuries) { const x = [...rules.injuries, ...rules.glitches].find((y) => y.name === i); if (x?.title) t.add(x.title); }
  if (f.sillyTrait) { const x = rules.silly.find((y) => y.name === f.sillyTrait); if (x?.title) t.add(x.title); }
  if (f.title) t.add(f.title);
  return Array.from(t);
}

export function Experience({ crew, fighter: f, update }: { crew: Crew; fighter: Fighter; update: Update }) {
  const rules = getRules();
  const e = rules.crew.experience;
  const set = (p: Partial<Fighter>) => patchFighter(update, f.id, (x) => ({ ...x, ...p }));
  const earned = advancesEarned(rules, f.xp);
  const th = rules.thresholds(earned + 1);
  const r = currentRatings(rules, f);
  const [kind, setKind] = useState<Advance['kind']>('trait');
  const [pick, setPick] = useState('');
  const last = f.advances[f.advances.length - 1];
  const lastWasRating = last && (last.kind === 'rating' || last.kind === 'ace');
  const isCaptain = f.id === crew.captainId;
  const forbid = isBot(rules, f) ? rules.crew.limits.botForbiddenRating.value : null;
  const taken = new Set(f.advances.flatMap((a) => (a.kind === 'trait' || a.kind === 'captain' ? [a.name] : [])));
  const hasRitesNow = hasRites(rules, crew, f);
  const known = ritesKnown(rules, f);

  const traitOpts = rules.advanceDefs.filter((d) => (d.list === e.commonList.value || (r[d.list] ?? 0) >= e.traitListNeedsRating.value) && !taken.has(d.name)
    && (!d.needs || (d.needs === e.ritesAdvance.value ? hasRitesNow : taken.has(d.needs)))
    && !(riteFromAdvance(rules, d.name) && known.includes(riteFromAdvance(rules, d.name)!)));
  const ratingOpts = ratingNames(rules).filter((n) => (r[n] ?? 0) < e.ratingAdvanceMax.value && n !== forbid);
  const aceOpts = ratingNames(rules).filter((n) => r[n] === e.aceTo.value - 1 && n !== forbid);
  const aceUsed = f.advances.some((a) => a.kind === 'ace');
  const aceOk = !aceUsed && f.advances.length + 1 >= e.aceFromAdvanceNumber.value && aceOpts.length > 0;
  const capOpts = rules.captainTraits.filter((t) => !captainTraitNames(f).includes(t.name));

  const take = () => {
    if (!pick) return;
    let a: Advance;
    if (kind === 'trait') { const d = traitOpts.find((x) => `${x.list}|${x.name}` === pick)!; a = { id: uid('a'), kind: 'trait', list: d.list, name: d.name }; }
    else if (kind === 'captain') a = { id: uid('a'), kind: 'captain', name: pick };
    else a = { id: uid('a'), kind, rating: pick };
    set({ advances: [...f.advances, a] });
    setPick('');
  };
  const pending = earned - f.advances.length;
  const used = traitBudgetUsed(f);

  return (
    <section className="stack-s">
      <h4>Experience and advances</h4>
      <div className="row gap wrap center">
        <label className="field"><span>Total XP</span>
          <span className="row gap-s">
            <button className="btn small" aria-label="One less XP" onClick={() => set({ xp: Math.max(0, f.xp - 1) })}>−</button>
            <input type="number" min={0} className="num" value={f.xp} onChange={(e) => set({ xp: Math.max(0, +e.target.value || 0) })} />
            <button className="btn small" aria-label="One more XP" onClick={() => set({ xp: f.xp + 1 })}>+</button>
          </span>
        </label>
        <span className="small">Thresholds: {th.map((t, i) => <span key={t} className={i < earned ? 'reached' : 'muted'}>{t}{i < th.length - 1 ? ', ' : ''}</span>)} · next at {th[earned]}</span>
        <span className="small">Trait lines: {used}/{rules.crew.limits.traitBudget.value}</span>
      </div>
      <ol className="advances">
        {f.captainTraits.map((t, i) => (
          <li key={`c${i}`} className={t.retired ? 'retired' : ''}>
            <RuleLink rule={captainRule(rules, t.name)}>{t.name}</RuleLink> <span className="muted small">captain trait</span>
            <button className="link" onClick={() => set({ captainTraits: f.captainTraits.map((x, j) => (j === i ? { ...x, retired: !x.retired } : x)) })}>{t.retired ? 'Restore' : 'Retire'}</button>
          </li>
        ))}
        {f.advances.map((a) => (
          <li key={a.id} className={'retired' in a && a.retired ? 'retired' : ''}>
            {a.kind === 'trait' && <><RuleLink rule={advanceRule(rules, a.name)}>{a.name}</RuleLink> <span className="muted small">{a.list}</span></>}
            {a.kind === 'captain' && <><RuleLink rule={captainRule(rules, a.name)}>{a.name}</RuleLink> <span className="muted small">captain trait</span></>}
            {a.kind === 'rating' && <>+1 {a.rating} <span className="muted small">rating advance</span></>}
            {a.kind === 'ace' && <>Ace: {a.rating} to {e.aceTo.value}</>}
            {(a.kind === 'trait' || a.kind === 'captain') && <button className="link" onClick={() => set({ advances: f.advances.map((x) => (x.id === a.id ? { ...x, retired: !(x as { retired?: boolean }).retired } : x)) })}>{a.retired ? 'Restore' : 'Retire'}</button>}
            <button className="link danger" onClick={() => set({ advances: f.advances.filter((x) => x.id !== a.id) })}>Remove</button>
          </li>
        ))}
      </ol>
      {pending > 0 ? (
        <div className="take-advance row gap wrap">
          <label className="field"><span>Advance {f.advances.length + 1}</span>
            <select value={kind} onChange={(ev) => { setKind(ev.target.value as Advance['kind']); setPick(''); }}>
              <option value="trait">A trait</option>
              <option value="rating" disabled={lastWasRating || !ratingOpts.length}>A rating advance{lastWasRating ? ' (not after a rating advance)' : ''}</option>
              <option value="ace" disabled={lastWasRating || !aceOk}>The Ace{aceUsed ? ' (taken)' : ''}</option>
              {isCaptain && e.captainListAsAdvance.value && <option value="captain">A captain trait</option>}
            </select>
          </label>
          <label className="field grow"><span>Which</span>
            <select value={pick} onChange={(ev) => setPick(ev.target.value)}>
              <option value="">Choose…</option>
              {kind === 'trait' && rules.advanceLists.map((list) => {
                const opts = traitOpts.filter((d) => d.list === list);
                return opts.length ? <optgroup key={list} label={list}>{opts.map((d) => <option key={d.name} value={`${d.list}|${d.name}`}>{d.name}</option>)}</optgroup> : null;
              })}
              {kind === 'rating' && ratingOpts.map((n) => <option key={n} value={n}>{n} {r[n]} → {r[n] + 1}</option>)}
              {kind === 'ace' && aceOpts.map((n) => <option key={n} value={n}>{n} {r[n]} → {r[n] + 1}</option>)}
              {kind === 'captain' && capOpts.map((t) => <option key={t.name}>{t.name}</option>)}
            </select>
          </label>
          <button className="btn primary" onClick={take} disabled={!pick}>Take it</button>
          {kind === 'trait' && pick && <p className="small grow"><RuleLink rule={advanceRule(rules, pick.split('|')[1])}>Read the rule</RuleLink></p>}
        </div>
      ) : <p className="muted small">No advance to take: the next comes at {th[earned]} XP.</p>}
      <Legends fighter={f} set={set} />
    </section>
  );
}

function Legends({ fighter: f, set }: { fighter: Fighter; set: (p: Partial<Fighter>) => void }) {
  const rules = getRules();
  const [pick, setPick] = useState('');
  const have = new Set(f.legends.map((l) => l.name));
  return (
    <div className="stack-s">
      <h4>Legends <span className="muted small">(count toward the five, 13.8)</span></h4>
      <ul className="plain-list">
        {f.legends.map((l) => (
          <li key={l.id} className={l.retired ? 'retired' : ''}>
            <RuleLink rule={legendRule(rules, l.name)}>{l.name}</RuleLink> {l.title && <span className="muted">"{l.title}"</span>}
            <button className="link" onClick={() => set({ legends: f.legends.map((x) => (x.id === l.id ? { ...x, retired: !x.retired } : x)) })}>{l.retired ? 'Restore' : 'Retire'}</button>
            <button className="link danger" onClick={() => set({ legends: f.legends.filter((x) => x.id !== l.id) })}>Remove</button>
          </li>
        ))}
      </ul>
      <div className="row gap-s wrap">
        <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Legend earned">
          <option value="">A Legend earned…</option>
          {rules.legends.filter((l) => !have.has(l.name)).map((l) => <option key={l.name} value={l.name}>{l.name} ({l.from})</option>)}
        </select>
        <button className="btn small" disabled={!pick} onClick={() => { const l = rules.legends.find((x) => x.name === pick)!; set({ legends: [...f.legends, { id: uid('g'), name: l.name, title: l.title }], title: f.title || l.title || '' }); setPick(''); }}>Add</button>
      </div>
    </div>
  );
}

function Injuries({ crew, fighter: f, update }: { crew: Crew; fighter: Fighter; update: Update }) {
  const rules = getRules();
  const set = (p: Partial<Fighter>) => patchFighter(update, f.id, (x) => ({ ...x, ...p }));
  const bot = isBot(rules, f);
  const list = bot ? rules.glitches : rules.injuries;
  const max = rules.crew.limits.maxLastingInjuries.value;
  const [pick, setPick] = useState('');
  void crew;
  return (
    <section className="stack-s">
      <h4>{bot ? 'Glitches' : 'Lasting injuries'} <span className="muted small">({f.injuries.length}/{max})</span></h4>
      <ul className="plain-list">
        {f.injuries.map((i, k) => (
          <li key={k}><RuleLink rule={injuryRule(rules, i)}>{i}</RuleLink> <button className="link danger" onClick={() => set({ injuries: f.injuries.filter((_, j) => j !== k) })}>Remove</button></li>
        ))}
      </ul>
      {f.injuries.length < max && (
        <div className="row gap-s wrap">
          <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Add an injury">
            <option value="">{bot ? 'Add a glitch…' : 'Add an injury…'}</option>
            {Array.from(new Set(list.map((i) => i.table))).map((t) => (
              <optgroup key={t} label={t}>{list.filter((i) => i.table === t).map((i) => <option key={i.name} value={i.name}>{i.name} ("{i.title}")</option>)}</optgroup>
            ))}
          </select>
          <button className="btn small" disabled={!pick} onClick={() => { const i = list.find((x) => x.name === pick); set({ injuries: [...f.injuries, pick], titles: i?.title ? Array.from(new Set([...f.titles, i.title])) : f.titles }); setPick(''); }}>Add</button>
        </div>
      )}
      <p className="muted small">Prosthetics are bought in the shop and fitted from the gear list (13.2, 14.3).</p>
    </section>
  );
}

function Character({ fighter: f, set }: { fighter: Fighter; set: (p: Partial<Fighter>) => void }) {
  const rules = getRules();
  const [line, setLine] = useState('');
  return (
    <section className="stack-s">
      <h4>Word, silly trait, past and history</h4>
      <div className="row gap wrap">
        <label className="field grow"><span>Word (this battle's promise)</span><input value={f.word} onChange={(e) => set({ word: e.target.value })} placeholder="I swear by my tape…" /></label>
        <label className="field"><span>Silly trait <RuleLink rule={f.sillyTrait ? sillyRule(rules, f.sillyTrait) : null}>rule</RuleLink></span>
          <select value={f.sillyTrait ?? ''} onChange={(e) => set({ sillyTrait: e.target.value || null })}>
            <option value="">None</option>
            {Array.from(new Set(rules.silly.map((s) => s.table))).map((t) => (
              <optgroup key={t} label={t}>{rules.silly.filter((s) => s.table === t).map((s) => <option key={s.name} value={s.name}>{s.name} ("{s.title}")</option>)}</optgroup>
            ))}
          </select>
        </label>
        <label className="field"><span>Past</span><input value={f.past} onChange={(e) => set({ past: e.target.value })} placeholder="Unwritten" /></label>
      </div>
      <ul className="plain-list small">{f.history.map((h, i) => <li key={i}>{h} <button className="link danger" onClick={() => set({ history: f.history.filter((_, j) => j !== i) })}>Remove</button></li>)}</ul>
      <form className="row gap-s" onSubmit={(e) => { e.preventDefault(); if (line.trim()) { set({ history: [...f.history, line.trim()] }); setLine(''); } }}>
        <input className="grow" value={line} onChange={(e) => setLine(e.target.value)} placeholder="One line of History after the battle" aria-label="History line" />
        <button className="btn small">Add</button>
      </form>
    </section>
  );
}

function RemoveFighter({ crew, fighter: f, update }: { crew: Crew; fighter: Fighter; update: Update }) {
  const ask = useAsk();
  const rules = getRules();
  const [fate, setFate] = useState(rules.crew.campaign.fates.value[0]);
  const remove = async () => {
    if (!await ask(`Take ${fighterLabel(f)} off the roster as ${fate}? Their gear returns to the crew's stash.`)) return;
    update((c) => ({
      ...c,
      fighters: c.fighters.filter((x) => x.id !== f.id),
      captainId: c.captainId === f.id ? null : c.captainId,
      items: c.items.filter((o) => !(o.fighterId === f.id && o.slot === 'fitted')).map((o) => (o.fighterId === f.id ? { ...o, fighterId: null, slot: 'stash' } : o)),
      notes: { ...c.notes, roll: [...c.notes.roll, { id: uid('r'), name: fighterLabel(f), titles: availableTitles(f).join(', '), fate, note: '' }] },
    }));
  };
  void crew;
  return (
    <details className="danger-zone">
      <summary>Leave the roster (dead, Taken, destroyed)</summary>
      <div className="row gap-s wrap">
        <select value={fate} onChange={(e) => setFate(e.target.value)} aria-label="Fate">{rules.crew.campaign.fates.value.map((x) => <option key={x}>{x}</option>)}</select>
        <button className="btn small danger" onClick={remove}>Put on the roll</button>
        <button className="btn small" onClick={async () => { if (await ask(`Dismiss ${fighterLabel(f)} without a trace?`)) update((c) => ({ ...c, fighters: c.fighters.filter((x) => x.id !== f.id), captainId: c.captainId === f.id ? null : c.captainId, items: c.items.map((o) => (o.fighterId === f.id ? { ...o, fighterId: null, slot: 'stash' } : o)) })); }}>Dismiss</button>
      </div>
    </details>
  );
}

// ---------- parts ----------
function PartsTab({ crew, update }: { crew: Crew; update: Update }) {
  const rules = getRules();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const tax = airTax(rules, crew);
  const t = rules.crew.campaign.airTax;
  return (
    <div className="stack">
      <div className="card">
        <h3>Air tax <span className="section-tag">§ {t.source}</span></h3>
        <p>{t.value} parts for each fighter on the roster; {t.exempt.join(', ')} fighters don't pay. This break: <strong>{tax.amount} parts</strong> for {tax.payers.length} fighters.</p>
        <button className="btn" onClick={() => update((c) => addLedger(c, -tax.amount, `Air tax (${tax.payers.length} fighters)`))}>Pay {tax.amount} parts</button>
        <p className="muted small">A fighter whose tax goes unpaid misses their task this break. Recharging costs {rules.crew.campaign.rechargePerEnergy.value} part per Energy.</p>
      </div>
      <form className="card stack-s" onSubmit={(e) => { e.preventDefault(); const n = parseInt(amount, 10); if (!isNaN(n) && n !== 0) { update((c) => addLedger(c, n, note || (n > 0 ? 'Parts gained' : 'Parts spent'))); setAmount(''); setNote(''); } }}>
        <h3>Gain or spend parts</h3>
        <div className="row gap wrap">
          <label className="field"><span>Amount (use − to spend)</span><input type="number" className="num" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <label className="field grow"><span>What for</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Scavenge task, fines, recharge…" /></label>
        </div>
        <button className="btn">Add to the ledger</button>
      </form>
      <div className="card">
        <h3>Ledger</h3>
        <table className="tbl">
          <tbody>
            {[...crew.ledger].reverse().map((l) => (
              <tr key={l.id}><td className="muted small">{new Date(l.at).toLocaleDateString()}</td><td>{l.note}</td><td className={`num ${l.amount < 0 ? 'neg' : ''}`}>{l.amount > 0 ? '+' : ''}{l.amount}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- notes ----------
function NotesTab({ crew, update, messages }: { crew: Crew; update: Update; messages: Message[] }) {
  const rules = getRules();
  const L = rules.crew.limits;
  const n = crew.notes;
  const setNotes = (p: Partial<Crew['notes']>) => update((c) => ({ ...c, notes: { ...c.notes, ...p } }));
  const [tag, setTag] = useState('');
  const [contact, setContact] = useState('');
  const [rival, setRival] = useState('');
  const addTag = () => {
    if (!tag || n.tags.includes(tag)) return;
    // Ran and Reliable replace each other; a new tag replaces the oldest when there are three (14.10).
    let tags = n.tags;
    for (const t of rules.tags) { const m = t.text.match(/cannot have both (\w+) and (\w+)/); if (m && (m[1] === tag || m[2] === tag)) tags = tags.filter((x) => x !== m[1] && x !== m[2]); }
    tags = [...tags, tag];
    if (tags.length > L.maxTags.value) tags = tags.slice(tags.length - L.maxTags.value);
    setNotes({ tags });
    setTag('');
  };
  return (
    <div className="stack">
      <Messages messages={messages} />
      <div className="notes-grid">
        <div className="card stack-s">
          <h3>Tags <span className="muted small">({n.tags.length}/{L.maxTags.value}, {L.maxTags.source})</span></h3>
          <ul className="plain-list">{n.tags.map((t) => (
            <li key={t}><RuleLink rule={tagRule(rules, t)}>{t}</RuleLink>
              <button className="link" onClick={() => setNotes({ tags: n.tags.filter((x) => x !== t) })}>Remove</button>
              <button className="link" onClick={() => update((c) => addLedger({ ...c, notes: { ...c.notes, tags: c.notes.tags.filter((x) => x !== t) } }, -rules.crew.campaign.removeTag.value, `Rumour boards rewritten: ${t} removed`))}>Pay {rules.crew.campaign.removeTag.value} to remove</button>
            </li>
          ))}</ul>
          <div className="row gap-s"><select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Tag"><option value="">Add a tag…</option>{rules.tags.filter((t) => !n.tags.includes(t.name)).map((t) => <option key={t.name}>{t.name}</option>)}</select><button className="btn small" onClick={addTag} disabled={!tag}>Add</button></div>
          <p className="muted small">A new tag replaces the oldest when there are three.</p>
        </div>
        <div className="card stack-s">
          <h3>Contacts <span className="muted small">({n.contacts.length}/{L.maxContacts.value}, each used once)</span></h3>
          <ul className="plain-list">{n.contacts.map((c, i) => (
            <li key={i} className={c.used ? 'retired' : ''}>
              <label className="check"><input type="checkbox" checked={c.used} onChange={() => setNotes({ contacts: n.contacts.map((x, j) => (j === i ? { ...x, used: !x.used } : x)) })} /> <RuleLink rule={contactRule(rules, c.name)}>{c.name}</RuleLink> {c.used && '(used)'}</label>
              <button className="link" onClick={() => setNotes({ contacts: n.contacts.filter((_, j) => j !== i) })}>Remove</button>
            </li>
          ))}</ul>
          {n.contacts.filter((c) => !c.used).length < L.maxContacts.value && (
            <div className="row gap-s"><select value={contact} onChange={(e) => setContact(e.target.value)} aria-label="Contact"><option value="">Add a contact…</option>{rules.contacts.map((c) => <option key={c.name}>{c.name}</option>)}</select>
              <button className="btn small" disabled={!contact} onClick={() => { setNotes({ contacts: [...n.contacts.filter((c) => !c.used), { name: contact, used: false }] }); setContact(''); }}>Add</button></div>
          )}
        </div>
        <div className="card stack-s">
          <h3>Rivals</h3>
          <ul className="plain-list">{n.rivals.map((r, i) => <li key={i}>{r} <button className="link" onClick={() => setNotes({ rivals: n.rivals.filter((_, j) => j !== i) })}>Remove</button></li>)}</ul>
          <form className="row gap-s" onSubmit={(e) => { e.preventDefault(); if (rival.trim()) { setNotes({ rivals: [...n.rivals, rival.trim()] }); setRival(''); } }}>
            <input value={rival} onChange={(e) => setRival(e.target.value)} placeholder="A crew, gang or patron" aria-label="Rival" /><button className="btn small">Add</button>
          </form>
        </div>
        <div className="card stack-s">
          <h3>Rumour about the crew <span className="muted small">(one, 14.8)</span></h3>
          <input value={n.rumour} onChange={(e) => setNotes({ rumour: e.target.value })} aria-label="Crew rumour" />
          <h3>Stash notes</h3>
          <textarea value={n.stash} onChange={(e) => setNotes({ stash: e.target.value })} aria-label="Stash notes" rows={2} />
        </div>
      </div>
      <div className="card">
        <h3>The roll: the dead, the Taken, and their titles</h3>
        {n.roll.length === 0 ? <p className="muted small">Nobody yet. Long may it stay that way.</p> : (
          <table className="tbl"><tbody>{n.roll.map((r) => (
            <tr key={r.id}><td>{r.name}</td><td>{r.titles}</td><td>{r.fate}</td>
              <td><input value={r.note} placeholder="Note" aria-label="Note" onChange={(e) => setNotes({ roll: n.roll.map((x) => (x.id === r.id ? { ...x, note: e.target.value } : x)) })} /></td></tr>
          ))}</tbody></table>
        )}
      </div>
    </div>
  );
}

// ---------- season ----------
function SeasonTab({ crew, update }: { crew: Crew; update: Update }) {
  const s = crew.notes.season;
  const set = (season: Crew['notes']['season']) => update((c) => ({ ...c, notes: { ...c.notes, season } }));
  const total = s.reduce((a, x) => a + (x.points || 0), 0);
  const cols: [keyof Crew['notes']['season'][number], string][] = [['battle', 'Battle'], ['world', 'World'], ['opponent', 'Opponent'], ['winCond', 'Winning condition'], ['heldField', 'Held the field'], ['story', 'Story event']];
  return (
    <div className="stack">
      <p>League points: <strong>{total}</strong> over {s.length} battle{s.length === 1 ? '' : 's'} (14.12).</p>
      <div className="table-scroll">
        <table className="tbl season">
          <thead><tr>{cols.map(([, l]) => <th key={l}>{l}</th>)}<th>Points</th><th /></tr></thead>
          <tbody>
            {s.map((row) => (
              <tr key={row.id}>
                {cols.map(([k, l]) => <td key={k}><input aria-label={l} value={String(row[k] ?? '')} onChange={(e) => set(s.map((x) => (x.id === row.id ? { ...x, [k]: e.target.value } : x)))} /></td>)}
                <td><input type="number" className="num" aria-label="League points" value={row.points} onChange={(e) => set(s.map((x) => (x.id === row.id ? { ...x, points: +e.target.value || 0 } : x)))} /></td>
                <td><button className="link danger" onClick={() => set(s.filter((x) => x.id !== row.id))}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn" onClick={() => set([...s, { id: uid('s'), battle: String(s.length + 1), world: '', opponent: '', winCond: '', heldField: '', story: '', points: 0 }])}>Add a battle</button>
    </div>
  );
}

// ---------- underdogs ----------
function UnderdogTab({ crew }: { crew: Crew }) {
  const rules = getRules();
  const ours = strength(crew);
  const [fighters, setFighters] = useState('');
  const [xp, setXp] = useState('');
  const theirs = (parseInt(fighters, 10) || 0) * 10 + (parseInt(xp, 10) || 0);
  const res = underdog(rules, ours, theirs);
  return (
    <div className="card stack-s">
      <h3>Underdogs <span className="section-tag">§ {rules.crew.underdogs.strength.source}</span></h3>
      <p>Strength is {rules.crew.underdogs.strength.value}. Yours: <strong>{ours}</strong> ({crew.fighters.length} fighters, {crew.fighters.reduce((a, f) => a + f.xp, 0)} XP).</p>
      <div className="row gap wrap">
        <label className="field"><span>Opponent's fighters</span><input type="number" min={0} className="num" value={fighters} onChange={(e) => setFighters(e.target.value)} /></label>
        <label className="field"><span>Opponent's total XP</span><input type="number" min={0} className="num" value={xp} onChange={(e) => setXp(e.target.value)} /></label>
      </div>
      {fighters && (
        <p className="result">
          Opponent strength {theirs}; difference {res.diff}.{' '}
          {res.underdog === 'us' ? <strong>You are the underdog: each of your fighters who takes part gains +{res.xp} XP after the battle.</strong>
            : res.underdog === 'them' ? <strong>They are the underdog: their fighters gain +{res.xp} XP.</strong>
            : `Nobody is the underdog (it takes ${rules.crew.underdogs.threshold.value[0]} or more).`}
        </p>
      )}
    </div>
  );
}
