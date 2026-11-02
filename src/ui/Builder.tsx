import { useEffect, useMemo, useRef } from 'react';
import { getRules, plain } from '../data/rules';
import {
  captainOf, creationSpend, finishCreation, giftPrice, hasGift, hasRites, isBot, kitLines, kitPickOptions, partsLeft, resetKit, ritesAllowed, ritesPrice,
  setFaction, syncKit,
} from '../engine/crew';
import type { Crew, Fighter } from '../engine/model';
import { validate, type Message, type Step } from '../engine/validate';
import { crewToJson, download, fileName, shareLink } from '../store';
import { go } from '../App';
import { Equip, FighterBasics, Hire, ItemChip, Md, Messages, PartsCounter, SellerControl, Shop, Stash, describeType, fighterLabel, patchFighter, type Update } from './common';
import { copyLink, useAsk } from './confirm';
import { RuleLink, captainRule, giftRule, itemRule, ritesRule, sectionRule, speciesRule, typeRule } from './rule';

const STEPS: { id: Step | 'review'; label: string; hint: string }[] = [
  { id: 'faction', label: 'Faction', hint: 'Choose who is paying (11.1, chapter 12).' },
  { id: 'rookies', label: 'Rookies', hint: 'Four free rookies: a name, a species, a type if your faction has them, and one rating at 1 (11.1).' },
  { id: 'captain', label: 'Captain', hint: 'One rookie leads, with one captain trait (11.2).' },
  { id: 'kit', label: 'Kit', hint: "Your faction's starting kit is free (chapter 12)." },
  { id: 'shop', label: 'Shop', hint: 'Spend the starting parts (11.3). What is not spent stays as parts.' },
  { id: 'equip', label: 'Equip', hint: 'Two Hands sets of up to 2 Hands, one Body, one Frame, a Belt of 3 (7.1).' },
  { id: 'specials', label: 'Specials', hint: 'The gift and Rites, at hire (11.4).' },
  { id: 'review', label: 'Review', hint: 'Check the crew, fix what is red, and save it.' },
];

export function Builder({ crew, update }: { crew: Crew; update: Update }) {
  const rules = getRules();
  const messages = useMemo(() => validate(rules, crew), [rules, crew]);
  const step = Math.min(crew.step, STEPS.length - 1);
  const cur = STEPS[step];
  const topRef = useRef<HTMLDivElement>(null);
  const setStep = (n: number) => {
    update((c) => {
      let next = { ...c, step: n };
      if (STEPS[n].id === 'kit' || n > STEPS.findIndex((s) => s.id === 'kit')) next = syncKit(rules, next);
      return next;
    });
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  useEffect(() => { document.title = `${crew.name || 'New crew'} · Dead Gate crew builder`; }, [crew.name]);
  const errors = messages.filter((m) => m.level === 'error');
  const stepMsgs = (id: string) => messages.filter((m) => m.step === id || (id === 'equip' && m.step === 'campaign'));
  const goTo = (m: Message) => { const i = STEPS.findIndex((s) => s.id === m.step); if (i >= 0) setStep(i); };

  return (
    <div className="builder" ref={topRef}>
      <div className="build-head">
        <div>
          <h1 className="crew-title">{crew.name || 'New crew'}</h1>
          <p className="muted small">{[crew.faction, crew.subfaction].filter(Boolean).join(', ') || 'No faction yet'}</p>
        </div>
        <PartsCounter crew={crew} />
      </div>
      <nav className="steps" aria-label="Crew creation steps">
        <ol>
          {STEPS.map((s, i) => {
            const n = stepMsgs(s.id).filter((m) => m.level === 'error').length;
            return (
              <li key={s.id}>
                <button className={`step ${i === step ? 'on' : ''} ${n && i < step ? 'bad' : ''}`} aria-current={i === step ? 'step' : undefined} onClick={() => setStep(i)}>
                  <span className="step-n">{i + 1}</span> {s.label}{n > 0 && i !== step ? <span className="dot" aria-label={`${n} to fix`} /> : null}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      <section className="step-body" aria-labelledby="step-title">
        <h2 id="step-title">{step + 1}. {cur.label}</h2>
        <p className="muted">{cur.hint}</p>
        {cur.id === 'faction' && <FactionStep crew={crew} update={update} />}
        {cur.id === 'rookies' && <RookiesStep crew={crew} update={update} messages={stepMsgs('rookies')} />}
        {cur.id === 'captain' && <CaptainStep crew={crew} update={update} />}
        {cur.id === 'kit' && <KitStep crew={crew} update={update} />}
        {cur.id === 'shop' && <ShopStep crew={crew} update={update} />}
        {cur.id === 'equip' && <EquipStep crew={crew} update={update} messages={messages.filter((m) => m.step === 'equip')} />}
        {cur.id === 'specials' && <SpecialsStep crew={crew} update={update} />}
        {cur.id === 'review' && <ReviewStep crew={crew} update={update} messages={messages} onGo={goTo} />}
        {cur.id !== 'review' && <Messages messages={stepMsgs(cur.id)} />}
      </section>
      <div className="step-nav">
        <button className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
        <span className="muted small">{errors.length ? `${errors.length} thing${errors.length === 1 ? '' : 's'} to fix` : 'No errors'}</span>
        {step < STEPS.length - 1 ? <button className="btn primary" onClick={() => setStep(step + 1)}>Next: {STEPS[step + 1].label}</button> : <span />}
      </div>
    </div>
  );
}

// ---------- 1. Faction ----------
const TAPES = ['yellow', 'red', 'gold', 'ink blue', 'hot pink', 'silver', 'black', 'green', 'orange', 'white'];
const TAPE_CSS: Record<string, string> = { 'ink blue': '#1d3a8a', 'hot pink': '#e0218a', gold: '#c9a227', silver: '#9aa0a6' };

function FactionStep({ crew, update }: { crew: Crew; update: Update }) {
  const ask = useAsk();
  const rules = getRules();
  const fac = rules.faction(crew.faction ?? '');
  return (
    <div className="stack">
      <div className="row gap wrap">
        <label className="field grow">
          <span>Crew name</span>
          <input value={crew.name} onChange={(e) => update((c) => ({ ...c, name: e.target.value }))} placeholder="The Leftover Spanners" />
        </label>
        <label className="field">
          <span>Tape colour <span className="muted">(optional)</span></span>
          <span className="row gap-s">
            <input list="tapes" value={crew.tape} onChange={(e) => update((c) => ({ ...c, tape: e.target.value }))} placeholder="yellow" />
            <span className="swatch" style={{ background: TAPE_CSS[crew.tape] ?? (crew.tape || 'transparent') }} aria-hidden="true" />
          </span>
          <datalist id="tapes">{TAPES.map((t) => <option key={t} value={t} />)}</datalist>
        </label>
      </div>
      <fieldset className="faction-grid">
        <legend className="sr-only">Faction</legend>
        {rules.factions.map((f) => (
          <label key={f.name} className={`faction-card ${crew.faction === f.name ? 'on' : ''}`}>
            <input type="radio" name="faction" className="sr-only" checked={crew.faction === f.name}
              onChange={async () => { if (crew.faction !== f.name && (!crew.faction || await ask(`Switch to ${f.name}? Types and starting kit will change.`))) update((c) => setFaction(rules, c, f.name)); }} />
            <strong>{f.name}</strong>
            <span className="muted small">{plain(f.voice).replace(/\s*[(,].*$/, '')}</span>
          </label>
        ))}
      </fieldset>
      {fac && (
        <div className="faction-detail card">
          <h3>{fac.name} <span className="section-tag">§ {fac.section}</span></h3>
          <h4>Faction rules</h4>
          <ol className="faction-rules">
            {fac.rules.map((r) => {
              const replaced = fac.subfactions.find((s) => s.name === crew.subfaction)?.replaces === r.n;
              return (
                <li key={r.n} className={replaced ? 'replaced' : ''}>
                  <strong>{r.name}.</strong> <Md text={r.text} />
                  {replaced && <span className="badge">Replaced by {crew.subfaction}</span>}
                </li>
              );
            })}
          </ol>
          <h4>Subfaction <span className="muted small">(each replaces one numbered rule)</span></h4>
          <div className="stack-s" role="radiogroup" aria-label="Subfaction">
            {fac.subfactions.map((s) => (
              <label key={s.name} className={`option ${crew.subfaction === s.name ? 'on' : ''}`}>
                <input type="radio" name="subfaction" checked={crew.subfaction === s.name} onChange={() => update((c) => ({ ...c, subfaction: s.name }))} />
                <span><strong>{s.name}</strong> <span className="badge">replaces rule {s.replaces}</span><br /><Md text={s.rule} /></span>
              </label>
            ))}
          </div>
          {fac.types.length > 0 && (
            <>
              <h4>Fighter types</h4>
              <ul className="plain-list">{fac.types.map((t) => <li key={t.name}><strong>{t.label}:</strong> <Md text={t.trait} /></li>)}</ul>
            </>
          )}
          <ul className="plain-list facts">
            <li><Md text={fac.voice} /></li>
            <li><Md text={fac.startingKit} /></li>
            <li><Md text={fac.specials} /></li>
            {fac.noWords && <li><Md text={fac.noWords} /></li>}
            <li><Md text={fac.ownTask} /></li>
            <li><Md text={fac.captiveFate} /></li>
          </ul>
          <details>
            <summary>Own task table (d6)</summary>
            <table className="tbl"><tbody>{fac.ownTaskTable.map((r) => <tr key={r.d6}><td>{r.d6}</td><td><Md text={r.Result} /></td></tr>)}</tbody></table>
          </details>
        </div>
      )}
    </div>
  );
}

// ---------- 2. Rookies ----------
function RookiesStep({ crew, update, messages }: { crew: Crew; update: Update; messages: Message[] }) {
  const rules = getRules();
  const fr = rules.factionRules(crew.faction ?? '');
  if (!crew.faction) return <p className="empty">Choose a faction first.</p>;
  return (
    <div className="stack">
      {fr?.rookiesMayBeBots?.value && <p className="note">{String(fr.rookiesMayBeBots.note ?? '')}.</p>}
      <div className="fighter-grid">
        {crew.fighters.map((f, i) => (
          <article key={f.id} className="card fighter-card">
            <header className="row between">
              <h3>{f.rookie ? `Rookie ${i + 1}` : 'Hired'}{f.id === crew.captainId ? ' · Captain' : ''}</h3>
              {!f.rookie && <button className="btn small danger" onClick={() => update((c) => ({ ...c, fighters: c.fighters.filter((x) => x.id !== f.id), items: c.items.map((o) => (o.fighterId === f.id ? { ...o, fighterId: null, slot: 'stash' } : o)) }))}>Dismiss</button>}
            </header>
            <FighterBasics crew={crew} fighter={f} lockType={!!fr?.fixedRookies && f.rookie} onChange={(nf) => patchFighter(update, f.id, () => nf)} />
            <p className="muted small"><RuleLink rule={speciesRule(rules, f.species)}>{f.species} trait</RuleLink>{f.type && <> · <RuleLink rule={typeRule(rules, crew.faction, f.type)}>{f.type} trait</RuleLink></>}</p>
            <Messages messages={messages.filter((m) => m.fighterId === f.id)} />
          </article>
        ))}
      </div>
      <p className="muted small">You can hire more recruits in the shop step.</p>
    </div>
  );
}

// ---------- 3. Captain ----------
function CaptainStep({ crew, update }: { crew: Crew; update: Update }) {
  const rules = getRules();
  const fr = rules.factionRules(crew.faction ?? '');
  const cap = captainOf(crew);
  const lock = fr?.captainType;
  const setCaptain = (id: string) => update((c) => {
    const old = captainOf(c);
    const traits = old?.captainTraits ?? [];
    return { ...c, captainId: id, fighters: c.fighters.map((f) => (f.id === id ? { ...f, captainTraits: traits } : f.id === old?.id ? { ...f, captainTraits: [] } : f)) };
  });
  return (
    <div className="stack">
      <fieldset className="stack-s">
        <legend>Who leads?{lock ? ` (${crew.faction}: the ${lock})` : ''}</legend>
        {crew.fighters.filter((f) => f.rookie).map((f) => (
          <label key={f.id} className={`option ${crew.captainId === f.id ? 'on' : ''}`}>
            <input type="radio" name="captain" checked={crew.captainId === f.id} disabled={!!lock && f.type !== lock} onChange={() => setCaptain(f.id)} />
            <span><strong>{fighterLabel(f)}</strong> <span className="muted">{describeType(f)}</span></span>
          </label>
        ))}
      </fieldset>
      {cap && (
        <fieldset className="stack-s">
          <legend>{fighterLabel(cap)}'s captain trait</legend>
          {rules.captainTraits.map((t) => {
            const on = cap.captainTraits.some((x) => x.name === t.name);
            return (
              <label key={t.name} className={`option ${on ? 'on' : ''}`}>
                <input type="radio" name="captain-trait" checked={on} onChange={() => patchFighter(update, cap.id, (f) => ({ ...f, captainTraits: [{ name: t.name }] }))} />
                <span><strong>{t.name}</strong> <RuleLink rule={captainRule(rules, t.name)}>§</RuleLink><br /><Md text={t.rule} /></span>
              </label>
            );
          })}
        </fieldset>
      )}
    </div>
  );
}

// ---------- 4. Kit ----------
function KitStep({ crew, update }: { crew: Crew; update: Update }) {
  const rules = getRules();
  const fac = rules.faction(crew.faction ?? '');
  if (!fac) return <p className="empty">Choose a faction first.</p>;
  const lines = kitLines(rules, crew);
  return (
    <div className="stack">
      <p><Md text={fac.startingKit} /></p>
      <ul className="stack-s plain-list">
        {lines.map((l) => {
          const owned = crew.items.find((o) => o.kitRef === l.ref);
          const holder = crew.fighters.find((f) => f.id === owned?.fighterId);
          return (
            <li key={l.ref} className="card kit-line">
              {l.pick ? (
                <label className="field">
                  <span>{l.label}</span>
                  <select value={l.itemId ?? ''} onChange={(e) => update((c) => syncKit(rules, { ...c, kitPicks: { ...c.kitPicks, [l.ref]: e.target.value } }))}>
                    <option value="">Choose…</option>
                    {kitPickOptions(rules, crew, l.pick).map((i) => <option key={i.id} value={i.id}>{i.name} ({i.price} parts{i.rite ? `, ${i.rite}` : ''})</option>)}
                  </select>
                </label>
              ) : <strong>{l.label}</strong>}
              {owned && <div className="row gap-s wrap"><ItemChip crew={crew} item={owned} update={update} /><span className="muted small">{holder ? `with ${fighterLabel(holder)}` : 'in the stash'}</span></div>}
              {l.pick && l.itemId && rules.item(l.itemId)?.kind === 'relic' && <p className="muted small">A priest can use it only if they know its rite (8.3).</p>}
            </li>
          );
        })}
      </ul>
      <button className="btn" onClick={() => update((c) => resetKit(rules, c))}>Hand out the kit again</button>
    </div>
  );
}

// ---------- 5. Shop ----------
function ShopStep({ crew, update }: { crew: Crew; update: Update }) {
  const rules = getRules();
  const fr = rules.factionRules(crew.faction ?? '');
  const bought = crew.items.filter((o) => !o.kitRef);
  const spend = creationSpend(rules, crew);
  return (
    <div className="stack">
      {(fr?.priceRules ?? []).length > 0 && <p className="note">Faction prices apply: {fr!.priceRules!.map((p) => p.effect).join('; ')}{crew.subfaction ? ` (unless ${crew.subfaction} replaces the rule)` : ''}.</p>}
      {fr?.credit && <p className="note">{crew.faction} may buy on credit down to {fr.credit.value} parts (rule {fr.credit.rule}).</p>}
      <div className="card">
        <h3>Bought so far</h3>
        {bought.length === 0 ? <p className="muted small">Nothing yet. The till is open.</p> : (
          <ul className="plain-list stack-s">
            {bought.map((o) => {
              const d = rules.item(o.itemId)!;
              return (
                <li key={o.uid} className="row gap-s wrap between">
                  <RuleLink rule={itemRule(rules, d)}>{d.name}</RuleLink>
                  <span className="muted small">{d.source}</span>
                  <SellerControl crew={crew} item={o} update={update} />
                  <button className="btn small" onClick={() => update((c) => ({ ...c, items: c.items.filter((x) => x.uid !== o.uid) }))}>Return</button>
                </li>
              );
            })}
          </ul>
        )}
        <details>
          <summary>Where the parts went ({spend.reduce((a, l) => a + l.amount, 0)})</summary>
          <ul className="plain-list small">{spend.map((l, i) => <li key={i}>{l.label}: {l.amount}</li>)}</ul>
        </details>
      </div>
      <Shop crew={crew} update={update} />
      <Hire crew={crew} update={update} />
    </div>
  );
}

// ---------- 6. Equip ----------
function EquipStep({ crew, update, messages }: { crew: Crew; update: Update; messages: Message[] }) {
  return (
    <div className="stack">
      <Stash crew={crew} update={update} />
      <div className="fighter-grid">
        {crew.fighters.map((f) => (
          <article key={f.id} className="card">
            <h3>{fighterLabel(f)} <span className="muted small">{describeType(f)}</span></h3>
            <Equip crew={crew} fighter={f} update={update} messages={messages.filter((m) => m.fighterId === f.id)} />
          </article>
        ))}
      </div>
    </div>
  );
}

// ---------- 7. Specials ----------
function SpecialsStep({ crew, update }: { crew: Crew; update: Update }) {
  const rules = getRules();
  const gs = rules.crew.limits.giftSpecies.value;
  const gifted = crew.fighters.filter((f) => hasGift(rules, crew, f)).length;
  return (
    <div className="stack">
      <p className="muted">
        <RuleLink rule={giftRule(rules)}>The gift</RuleLink>: {gs.join(' or ')} only, at most {rules.crew.limits.maxGifted.value} gifted in a crew ({gifted} now).{' '}
        <RuleLink rule={ritesRule(rules)}>Rites</RuleLink>: any rookie; a priest knows rites and can use only the relics of those rites.
      </p>
      <div className="fighter-grid">
        {crew.fighters.map((f) => <SpecialsCard key={f.id} crew={crew} fighter={f} update={update} />)}
      </div>
    </div>
  );
}

function SpecialsCard({ crew, fighter: f, update }: { crew: Crew; fighter: Fighter; update: Update }) {
  const rules = getRules();
  const gp = giftPrice(rules, crew, f);
  const rp = ritesPrice(rules, crew, f);
  const giftFree = gp === 0;
  const ritesFree = rp === 0;
  const giftOk = rules.crew.limits.giftSpecies.value.includes(f.species) && gp !== null && !isBot(rules, f);
  const allowed = ritesAllowed(rules, crew, f);
  const set = (p: Partial<Fighter>) => patchFighter(update, f.id, (x) => ({ ...x, ...p }));
  return (
    <article className="card">
      <h3>{fighterLabel(f)} <span className="muted small">{describeType(f)}</span></h3>
      <label className={`check ${!giftOk && !f.gift ? 'disabled' : ''}`}>
        <input type="checkbox" checked={hasGift(rules, crew, f)} disabled={giftFree || (!giftOk && !f.gift)} onChange={(e) => set({ gift: e.target.checked })} />
        The gift {giftFree ? '(free: type)' : gp === null ? '(not for this faction)' : `(${gp} parts)`}
      </label>
      {!giftOk && !giftFree && <p className="muted small">{gp === null ? `${crew.faction} may not have psions.` : `Only ${rules.crew.limits.giftSpecies.value.join(' and ')}s can have the gift.`}</p>}
      <label className="check">
        <input type="checkbox" checked={hasRites(rules, crew, f)} disabled={ritesFree || rp === null} onChange={(e) => set({ rites: e.target.checked, ritesKnown: e.target.checked ? f.ritesKnown : [] })} />
        Rites {ritesFree ? '(free: type)' : rp === null ? '(not for this faction)' : `(${rp} parts)`}
      </label>
      {hasRites(rules, crew, f) && (
        <fieldset className="field">
          <legend>Rites known ({f.ritesKnown.length} of {allowed})</legend>
          <div className="seg wrap">
            {rules.rites.map((r) => {
              const on = f.ritesKnown.includes(r);
              return (
                <label key={r} className={`seg-btn ${on ? 'on' : ''}`}>
                  <input type="checkbox" checked={on} disabled={!on && f.ritesKnown.length >= allowed} onChange={() => set({ ritesKnown: on ? f.ritesKnown.filter((x) => x !== r) : [...f.ritesKnown, r] })} />
                  {r}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
    </article>
  );
}

// ---------- 8. Review ----------
function ReviewStep({ crew, update, messages, onGo }: { crew: Crew; update: Update; messages: Message[]; onGo: (m: Message) => void }) {
  const ask = useAsk();
  const rules = getRules();
  const errors = messages.filter((m) => m.level === 'error');
  const link = shareLink(crew);
  const left = partsLeft(rules, crew);
  return (
    <div className="stack">
      <div className="card">
        <h3>{crew.name || 'Unnamed crew'}</h3>
        <p>{crew.faction}, {crew.subfaction}{crew.tape ? ` · ${crew.tape} tape` : ''} · {left} parts left</p>
        <table className="tbl">
          <thead><tr><th>Fighter</th><th>Species, type</th><th>Rating</th><th>Gear</th></tr></thead>
          <tbody>
            {crew.fighters.map((f) => (
              <tr key={f.id}>
                <td>{fighterLabel(f)}{f.id === crew.captainId ? ' (captain)' : ''}</td>
                <td>{describeType(f)}</td>
                <td>{Object.entries(f.baseRatings).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ')}</td>
                <td>{crew.items.filter((o) => o.fighterId === f.id).map((o) => rules.item(o.itemId)?.name).join(', ') || '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Checks</h3>
      <Messages messages={messages} empty="Everything checks out. A legal crew." onGo={onGo} />
      <div className="row gap wrap">
        <button className="btn primary" disabled={errors.length > 0}
          onClick={async () => { if (await ask('Save this crew as legal and start the campaign? Parts left are kept on the roster.')) update((c) => finishCreation(rules, c)); }}>
          Save the crew and start the campaign
        </button>
        <button className="btn" onClick={() => go(`/print/${crew.id}`)}>Print cards</button>
        <button className="btn" onClick={() => download(fileName(crew), crewToJson(crew))}>Export file</button>
        {link && <button className="btn" onClick={() => copyLink(ask, link)}>Copy share link</button>}
      </div>
      {errors.length > 0 && <p className="muted small">Your crew is saved on this device as you go. Fix the errors to save it as legal.</p>}
      <p className="muted small"><RuleLink rule={sectionRule('Fill in the cards', '11.1', 'Fill in the cards and the roster (Appendix C): parts, tags, contacts, rivals, rumours.')}>Next</RuleLink>: the campaign screen keeps the roster, experience and injuries.</p>
    </div>
  );
}

