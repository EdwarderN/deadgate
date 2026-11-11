// Pieces shared by the builder and the campaign screens.
import { useMemo, useState } from 'react';
import { getRules, type ItemDef } from '../data/rules';
import {
  addLedger, autoSlot, canSpend, equipped, fighterStats, giftPrice, hirePrice, isBot, itemPrice, needsSeller, newFighter, partsLeft, ratingNames,
  battery, builtInOptions, rechargeCost, recruitKey, ritesPrice, rookieSurcharge, sellValue, sellerTarget, setFighterType, setSellerResult, slotCapacity, slotLoad, slotOptions,
  beltSlots, canPayRunningCost, hireExtra, pendingSpend, replaceableRules, shopPrice, typeCarries, useSpend,
} from '../engine/crew';
import { uid, type Crew, type Fighter, type ItemSlot, type OwnedItem } from '../engine/model';
import type { Message } from '../engine/validate';
import { Md } from './md';
import { RollOrEnter } from './Dice';
import { activeEffects } from '../engine/faction';
import { RuleLink, itemRule, speciesRule, typeRule } from './rule';

export type Update = (fn: (c: Crew) => Crew) => void;

export const SLOT_LABEL: Record<ItemSlot, string> = {
  set1: 'Hands set 1', set2: 'Hands set 2', mount: 'Weapon mount', body: 'Body', frame: 'Frame', belt: 'Belt', fitted: 'Fitted', stash: 'Stash',
};

export function patchFighter(update: Update, id: string, fn: (f: Fighter) => Fighter) {
  update((c) => ({ ...c, fighters: c.fighters.map((f) => (f.id === id ? fn(f) : f)) }));
}

export function Messages({ messages, empty, onGo }: { messages: Message[]; empty?: string; onGo?: (m: Message) => void }) {
  if (!messages.length) return empty ? <p className="ok-text">{empty}</p> : null;
  const sorted = [...messages].sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
  return (
    <ul className="messages" aria-live="polite">
      {sorted.map((m, i) => (
        <li key={i} className={`msg ${m.level}`}>
          <span className="msg-icon" aria-hidden="true">{m.level === 'error' ? '✕' : '!'}</span>
          <span className="sr-only">{m.level === 'error' ? 'Error:' : 'Warning:'}</span>
          <span className="msg-text">{m.text} <span className="section-tag">({m.section})</span></span>
          {onGo && <button className="link" onClick={() => onGo(m)}>Fix</button>}
        </li>
      ))}
    </ul>
  );
}

export function PartsCounter({ crew }: { crew: Crew }) {
  const rules = getRules();
  const left = partsLeft(rules, crew);
  const start = rules.crew.creation.startingParts.value;
  return (
    <div className={`parts ${left < 0 ? 'neg' : ''}`} aria-live="polite">
      <span className="parts-num">{left}</span>
      <span className="parts-label">{crew.phase === 'creation' ? `of ${start} parts left` : 'parts'}</span>
    </div>
  );
}

// ---------- a fighter's name, species, type and starting rating ----------
export function FighterBasics({ crew, fighter, onChange, lockType }: { crew: Crew; fighter: Fighter; onChange: (f: Fighter) => void; lockType?: boolean }) {
  const rules = getRules();
  const fac = rules.faction(crew.faction ?? '');
  const fr = rules.factionRules(crew.faction ?? '');
  const types = fac?.types ?? [];
  const typesDecideSpecies = !!fr?.typeSpecies;
  const forbid = isBot(rules, fighter) ? rules.crew.limits.botForbiddenRating.value : null;
  const ratingOn = ratingNames(rules).find((r) => fighter.baseRatings[r] === 1) ?? '';
  const surcharge = fighter.rookie ? rookieSurcharge(rules, crew, fighter) : 0;
  const fid = fighter.id;
  const builtIns = builtInOptions(rules, crew, fighter.type);

  return (
    <div className="basics">
      <label className="field">
        <span>Name</span>
        <input value={fighter.name} placeholder="A name, a scar, a reason" onChange={(e) => onChange({ ...fighter, name: e.target.value })} />
      </label>
      {!typesDecideSpecies && (
        <label className="field">
          <span>Species <RuleLink rule={speciesRule(rules, fighter.species)}>rule</RuleLink></span>
          <select value={fighter.species} onChange={(e) => onChange({ ...fighter, species: e.target.value })}>
            {rules.crew.limits.playableSpecies.value.map((s) => {
              const p = rules.recruitPrices[s];
              const extra = fighter.rookie ? Math.max(0, p - rules.crew.creation.rookieBasePrice.value) : p;
              return <option key={s} value={s}>{s}{extra ? ` (${fighter.rookie ? '+' : ''}${extra} parts)` : ''}</option>;
            })}
          </select>
        </label>
      )}
      {fr?.types && (
        <label className="field">
          <span>{typesDecideSpecies ? 'Type (chassis or volunteer)' : 'Type'} <RuleLink rule={typeRule(rules, crew.faction, fighter.type)}>rule</RuleLink></span>
          {lockType ? (
            <output className="locked">{fighter.type} <span className="muted">(fixed for {crew.faction})</span></output>
          ) : (
            <select value={fighter.type ?? ''} onChange={(e) => onChange(setFighterType(rules, crew, fighter, e.target.value || null))}>
              <option value="">Choose a type</option>
              {types.map((t) => {
                const p = hirePrice(rules, crew, { species: fr.typeSpecies?.[t.name] ?? fighter.species, type: t.name });
                const extra = fighter.rookie ? Math.max(0, p - rules.crew.creation.rookieBasePrice.value) : 0;
                const limit = fr.typeLimits?.value[t.name];
                const full = limit !== undefined && crew.fighters.filter((x) => x.type === t.name && x.id !== fighter.id).length >= limit;
                return <option key={t.name} value={t.name} disabled={full}>{t.label}{extra ? ` (+${extra} parts)` : ''}{full ? ` (at most ${limit})` : ''}</option>;
              })}
            </select>
          )}
        </label>
      )}
      {builtIns && (
        <label className="field">
          <span>Built-in weapon <span className="muted">(free, no Hands, never removed)</span></span>
          <select value={fighter.builtIn ?? ''} onChange={(e) => onChange({ ...fighter, builtIn: e.target.value || null })}>
            <option value="">Choose a copy weapon…</option>
            {builtIns.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.price} parts)</option>)}
          </select>
        </label>
      )}
      {typesDecideSpecies && fighter.type && <p className="muted small">Species: {fighter.species} <RuleLink rule={speciesRule(rules, fighter.species)}>rule</RuleLink></p>}
      <fieldset className="field ratings-pick">
        <legend>Starting rating at 1 <span className="muted">(the rest stay at 0)</span></legend>
        <div className="seg" role="radiogroup">
          {ratingNames(rules).map((r) => (
            <label key={r} className={`seg-btn ${ratingOn === r ? 'on' : ''} ${forbid === r ? 'disabled' : ''}`}>
              <input type="radio" name={`rating-${fid}`} value={r} checked={ratingOn === r} disabled={forbid === r}
                onChange={() => onChange({ ...fighter, baseRatings: Object.fromEntries(ratingNames(rules).map((n) => [n, n === r ? 1 : 0])) })} />
              {r}
            </label>
          ))}
        </div>
      </fieldset>
      {surcharge > 0 && <p className="note">{recruitKey(rules, fighter)} costs {surcharge} more than a rookie: paid from the starting parts (9.1).</p>}
    </div>
  );
}

// ---------- seller roll for old stock ----------
export function SellerControl({ crew, item, update }: { crew: Crew; item: OwnedItem; update: Update }) {
  const rules = getRules();
  const t = sellerTarget(rules, crew);
  const set = (p: Partial<OwnedItem>) => update((c) => ({ ...c, items: c.items.map((o) => (o.uid === item.uid ? { ...o, ...p } : o)) }));
  if (!item.seller || item.kitRef) return null;
  if (item.seller === 'found') return <span className="badge ok">Seller found{item.sellerRoll ? ` (rolled ${item.sellerRoll})` : ''}</span>;
  if (item.seller === 'none') return <span className="badge err">No seller: rolled {item.sellerRoll}</span>;
  return (
    <span className="row gap-s wrap seller">
      <button className="btn small" onClick={() => { const r = 1 + Math.floor(Math.random() * 6); set({ seller: r >= t.value ? 'found' : 'none', sellerRoll: r }); }}>
        Roll for a seller ({t.value}+{t.why ? `, ${t.why}` : ''})
      </button>
      <label className="check small"><input type="checkbox" onChange={() => set({ seller: 'found' })} /> Found</label>
    </span>
  );
}

// ---------- the shop ----------
export function Shop({ crew, update }: { crew: Crew; update: Update }) {
  const rules = getRules();
  const [group, setGroup] = useState<string>('All');
  const [q, setQ] = useState('');
  const groups = useMemo(() => ['All', ...Array.from(new Set(rules.shopItems.map((i) => i.group)))], [rules]);
  const restricted = rules.crew.gear.restrictedItems.value;
  const visible = rules.shopItems.filter((i) => !restricted.some((r) => r.key === i.key && !r.factions.includes(crew.faction ?? '')));
  // An old-stock item with no seller this break is off the list until the next break (9.3).
  const lead = crew.relicLead;
  const leadFor = (i: ItemDef) => !!lead && i.kind === rules.crew.campaign.relicLeadKind.value;
  const noSeller = visible.filter((i) => needsSeller(rules, crew, i) && crew.sellers?.[i.id]?.found === false && !(leadFor(i) && lead?.noRoll));
  const list = visible.filter((i) => !noSeller.includes(i) && (group === 'All' || i.group === group) && i.name.toLowerCase().includes(q.toLowerCase()));
  const campaign = crew.phase === 'campaign';
  const target = sellerTarget(rules, crew);

  const buy = (it: ItemDef) => {
    update((c) => {
      // The break's first-purchase Spend effect, if any, applies to this one (14.6).
      const price = shopPrice(rules, c, it);
      const o: OwnedItem = { uid: uid('i'), itemId: it.id, fighterId: null, slot: 'stash', seller: needsSeller(rules, c, it) ? 'found' : undefined, sellerRoll: c.sellers?.[it.id]?.roll };
      let next: Crew = { ...c, items: [...c.items, campaign ? { ...o, paid: price } : o] };
      if (campaign) next = useSpend(addLedger(next, -price, `Bought ${it.name} (${it.source})`), 'purchase');
      return next;
    });
  };
  const [last, setLast] = useState<{ name: string; roll: number | null; found: boolean } | null>(null);
  /** A relic tip: one relic at half price, maybe with no seller roll (14.7). */
  const buyWithLead = (it: ItemDef) => {
    const price = Math.floor(itemPrice(rules, crew, it) / 2);
    update((c) => addLedger({ ...c, relicLead: null, items: [...c.items, { uid: uid('i'), itemId: it.id, fighterId: null, slot: 'stash', seller: 'found', paid: price, note: 'relic lead' }] }, -price, `Bought ${it.name} with a relic tip`));
  };
  const setSeller = (it: ItemDef, roll: number | null) => {
    setLast({ name: it.name, roll, found: roll === null || roll >= target.value });
    update((c) => setSellerResult(rules, c, it.id, roll));
  };

  return (
    <div className="shop">
      <div className="row gap wrap shop-filters">
        <label className="field grow"><span>Search</span><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Knife, armour, relic…" /></label>
        <label className="field"><span>Section</span>
          <select value={group} onChange={(e) => setGroup(e.target.value)}>{groups.map((g) => <option key={g}>{g}</option>)}</select>
        </label>
      </div>
      {lead && campaign && <p className="note small">A relic tip this break: one relic at half price{lead.noRoll ? ', with no seller roll' : ''} (14.7).</p>}
      <p className="muted small">Copies are always for sale. Old stock needs a seller first: one d6 per item per break, {target.value}+{target.why ? ` (${target.why})` : ''} (9.3). Roll in the app ("Seller"), type your own d6 roll and press Enter, or tick "Found" for a lead or no roll needed. Tap a name to read its rules.</p>
      {last && (
        <p className={`seller-result ${last.found ? 'ok' : 'bad'}`} role="status">
          {last.roll === null ? `${last.name}: marked as found.` : last.found
            ? `Rolled ${last.roll} for the ${last.name}: a seller (needs ${target.value}+). You can buy it now.`
            : `Rolled ${last.roll} for the ${last.name}: no seller this break (needs ${target.value}+).`}
        </p>
      )}
      {noSeller.length > 0 && (
        <p className="muted small no-seller">No seller this break: {noSeller.map((i) => `${i.name} (rolled ${crew.sellers?.[i.id]?.roll ?? '?'})`).join(', ')}. They're back on the list next break.</p>
      )}
      <ul className="shop-list">
        {list.map((it) => {
          const price = shopPrice(rules, crew, it);
          const ok = canSpend(rules, crew, price);
          const needs = needsSeller(rules, crew, it);
          const found = !needs || crew.sellers?.[it.id]?.found === true;
          const withLead = leadFor(it) && campaign && (found || lead!.noRoll);
          return (
            <li key={it.id} className={`shop-row ${found ? '' : 'needs-seller'}`}>
              <RuleLink rule={itemRule(rules, it)} className="shop-name">{it.name}</RuleLink>
              <span className={`badge src-${it.source.replace(' ', '-')}`}>{it.source}{it.source === 'old stock' && !needs ? ', no roll' : ''}{needs && found ? `, seller found${crew.sellers?.[it.id]?.roll ? ` (${crew.sellers[it.id].roll})` : ''}` : ''}</span>
              <span className="price">{price !== it.price && <s className="muted">{it.price}</s>} {price}</span>
              <div className="shop-act">
                {found && <button className="btn small" onClick={() => buy(it)} disabled={!ok} aria-label={`Buy ${it.name} (${it.source}) for ${price} parts`}>Buy</button>}
                {withLead && <button className="btn small primary lead-btn" onClick={() => buyWithLead(it)} disabled={!canSpend(rules, crew, Math.floor(price / 2))}>Relic lead: {Math.floor(price / 2)}</button>}
                {!found && !withLead && (
                  <>
                    <RollOrEnter compact die="d6" label={`Seller ${target.value}+`} onResult={(n) => setSeller(it, n)} />
                    <label className="check small" title="A lead, or no roll needed"><input type="checkbox" onChange={() => setSeller(it, null)} aria-label={`${it.name}: seller found without a roll`} /> Found</label>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------- hiring ----------
export function Hire({ crew, update }: { crew: Crew; update: Update }) {
  const rules = getRules();
  const fr = rules.factionRules(crew.faction ?? '');
  const fac = rules.faction(crew.faction ?? '');
  const [draft, setDraft] = useState<Fighter>(() => newFighter(rules, { baseRatings: Object.fromEntries(ratingNames(rules).map((n, i) => [n, i === 0 ? 1 : 0])) }));
  const full = crew.fighters.length >= rules.crew.limits.maxFighters.value;
  const price = hirePrice(rules, crew, draft);
  const gp = draft.gift ? giftPrice(rules, crew, draft) ?? 0 : 0;
  const rp = draft.rites ? ritesPrice(rules, crew, draft) ?? 0 : 0;
  const fixer = crew.phase === 'campaign' ? Object.entries(rules.crew.campaign.contactUses.value).find(([n, u]) => u.hireDiscount && crew.notes.contacts.some((c) => c.name === n && !c.used)) : undefined;
  const offers = crew.phase === 'campaign' ? [...(crew.hireOffers ?? []), ...(fixer ? [{ id: `contact:${fixer[0]}`, discount: fixer[1].hireDiscount!, note: `the ${fixer[0]}, used once (14.8)`, past: undefined }] : [])] : [];
  const [offerId, setOfferId] = useState('');
  const offer = offers.find((o) => o.id === offerId);
  const hireCost = offer ? (offer.discount === null ? 0 : Math.max(0, price - offer.discount)) : price;
  const extra = campaign0(crew) ? hireExtra(rules, crew) : 0;
  const total = hireCost + gp + rp + extra;
  const ok = !full && canSpend(rules, crew, total) && (!fr?.types || !!draft.type);
  const campaign = crew.phase === 'campaign';
  const hire = () => {
    update((c) => {
      let next: Crew = { ...c, hireOffers: (c.hireOffers ?? []).filter((o) => o.id !== offerId), fighters: [...c.fighters, { ...draft, past: offer?.past ?? draft.past, id: uid('f'), rookie: false, hirePaid: total, hiredBreak: c.after ? c.breakNo : undefined }] };
      if (offerId.startsWith('contact:')) {
        const n = offerId.slice(8);
        const i = next.notes.contacts.findIndex((x) => x.name === n && !x.used);
        next = { ...next, notes: { ...next.notes, contacts: next.notes.contacts.map((x, j) => (j === i ? { ...x, used: true } : x)) } };
      }
      if (campaign) next = useSpend(addLedger(next, -total, `Hired ${draft.name || recruitKey(rules, draft)}`), 'hire');
      return next;
    });
    setDraft(newFighter(rules, { baseRatings: draft.baseRatings, species: draft.species }));
    setOfferId('');
  };
  if (!fac) return null;
  const canGift = rules.crew.limits.giftSpecies.value.includes(draft.species) && giftPrice(rules, crew, draft) !== null;
  return (
    <div className="hire card">
      <h3>Hire a recruit</h3>
      <p className="muted small">A rookie with one rating of 1, no advances and no gear (14.9). At most {rules.crew.limits.maxFighters.value} fighters, bots included.</p>
      {full ? <p className="note">The crew is full.</p> : (
        <>
          <FighterBasics crew={crew} fighter={draft} onChange={setDraft} />
          {offers.length > 0 && (
            <label className="field"><span>An offer this break</span>
              <select value={offerId} onChange={(e) => setOfferId(e.target.value)}>
                <option value="">No offer: full price</option>
                {offers.map((o) => <option key={o.id} value={o.id}>{o.discount === null ? 'Free' : `${o.discount} parts less`}{o.note ? ` (${o.note})` : ''}{o.past ? `, Past "${o.past}"` : ''}</option>)}
              </select>
            </label>
          )}
          <div className="row gap wrap">
            {canGift && <label className="check"><input type="checkbox" checked={draft.gift} onChange={(e) => setDraft({ ...draft, gift: e.target.checked })} /> The gift (+{giftPrice(rules, crew, draft)})</label>}
            {ritesPrice(rules, crew, draft) !== null && <label className="check"><input type="checkbox" checked={draft.rites} onChange={(e) => setDraft({ ...draft, rites: e.target.checked })} /> Rites (+{ritesPrice(rules, crew, draft)})</label>}
          </div>
          <button className="btn primary" disabled={!ok} onClick={hire}>Hire for {total} parts</button>
        </>
      )}
    </div>
  );
}

// ---------- equipment ----------
export function Equip({ crew, fighter, update, messages }: { crew: Crew; fighter: Fighter; update: Update; messages?: Message[] }) {
  const rules = getRules();
  const st = fighterStats(rules, crew, fighter);
  const items = equipped(crew, fighter, rules);
  const slots: ItemSlot[] = ['set1', 'set2', ...(slotCapacity(rules, crew, fighter, 'mount') || items.some((o) => o.slot === 'mount') ? ['mount' as const] : []), 'body', 'frame', 'belt', ...(items.some((o) => o.slot === 'fitted') ? ['fitted' as const] : [])];
  return (
    <div className="equip">
      <StatLine crew={crew} fighter={fighter} />
      {typeCarries(rules, crew, fighter) && (() => { const c = typeCarries(rules, crew, fighter)!; const g = rules.factionRules(crew.faction ?? '')?.typeGrants?.[fighter.type ?? '']; return <p className="small">Always carries: <strong>{c.name}</strong> <span className="muted">({c.hands} Hand of the {c.set === 'set1' ? 'first' : 'second'} set{g?.note ? `; ${g.note}` : ''})</span></p>; })()}
      {fighter.builtIn && rules.item(fighter.builtIn) && <p className="small">Built in: <RuleLink rule={itemRule(rules, rules.item(fighter.builtIn)!)}>{rules.item(fighter.builtIn)!.name}</RuleLink> <span className="muted">(no Hands, never removed)</span></p>}
      <div className="slots">
        {slots.map((s) => {
          const inSlot = items.filter((o) => o.slot === s);
          const cap = slotCapacity(rules, crew, fighter, s);
          const load = slotLoad(rules, crew, fighter, s);
          const unit = s === 'set1' || s === 'set2' ? 'Hands' : '';
          return (
            <div key={s} className={`slot ${load > cap ? 'over' : ''}`}>
              <div className="slot-head">
                <span>{SLOT_LABEL[s]}</span>
                <span className="muted small">{s === 'fitted' ? '' : `${load}/${cap}${unit ? ` ${unit}` : ''}`}</span>
              </div>
              {inSlot.length === 0 ? <span className="muted small">empty</span> : inSlot.map((o) => <ItemChip key={o.uid} crew={crew} item={o} update={update} />)}
            </div>
          );
        })}
      </div>
      {st.notes.length > 0 && <p className="muted small">{st.notes.join(' · ')}</p>}
      {messages && <Messages messages={messages} />}
    </div>
  );
}

export function StatLine({ crew, fighter }: { crew: Crew; fighter: Fighter }) {
  const rules = getRules();
  const st = fighterStats(rules, crew, fighter);
  return (
    <dl className="statline">
      <div><dt>Move</dt><dd>{st.moveText}</dd></div>
      <div><dt>Hands</dt><dd>{st.hands}</dd></div>
      <div><dt>Save</dt><dd>{st.save === null ? '–' : st.save}</dd></div>
      <div><dt>Energy</dt><dd>{st.energy}</dd></div>
      <div><dt>Belt</dt><dd>{st.beltUsed}/{beltSlots(rules, crew)}</dd></div>
    </dl>
  );
}

/** One owned item with a menu to move it: to a slot, another fighter, the stash, or sell it. */
export function ItemChip({ crew, item, update }: { crew: Crew; item: OwnedItem; update: Update }) {
  const rules = getRules();
  const [sellingDrop, setSellingDrop] = useState(false);
  const def = rules.item(item.itemId);
  if (!def) return <span className="chip err">Unknown item {item.itemId}</span>;
  const owner = crew.fighters.find((f) => f.id === item.fighterId);
  const opts = slotOptions(rules, def);
  const campaign = crew.phase === 'campaign';
  const sv = sellValue(rules, crew, item);
  // a drop with several prices (drop armour: light or medium) offers each
  const variants: (string | null)[] = def.sells && def.sells.length > 1 ? def.sells.map((s) => s.label) : [null];
  const fence = crew.notes.contacts.find((c) => c.name === rules.crew.campaign.fenceContact.value && !c.used);
  // A faction rule may let the crew sell drops for a roll (Black Tape, 10.2).
  const dropSale = def.source === 'drop' && campaign ? activeEffects(rules, crew, 'break').find((e) => e.effect.kind === 'sellDrop') : undefined;

  const move = (choice: string) => {
    let val = choice;
    if (val === 'sell-drop') { setSellingDrop(true); return; }
    update((c) => {
      if (val === 'stash') return { ...c, items: c.items.map((o) => (o.uid === item.uid ? { ...o, fighterId: null, slot: 'stash' } : o)) };
      if (val === 'remove') return { ...c, items: c.items.filter((o) => o.uid !== item.uid) };
      if (val.startsWith('sell:') || val.startsWith('sell-fence:')) {
        const [how, vi] = val.split(':');
        const variant = +vi || 0;
        const amount = sellValue(rules, c, item, how === 'sell-fence', variant) ?? 0;
        val = how;
        let next: Crew = { ...c, items: c.items.filter((o) => o.uid !== item.uid) };
        if (val === 'sell-fence') {
          const i = next.notes.contacts.findIndex((x) => x.name === rules.crew.campaign.fenceContact.value && !x.used);
          next = { ...next, notes: { ...next.notes, contacts: next.notes.contacts.map((x, j) => (j === i ? { ...x, used: true } : x)) } };
        }
        const full = val !== 'sell-fence' && !!pendingSpend(c, 'sale');
        if (full) next = useSpend(next, 'sale');
        const vlabel = def.sells && def.sells.length > 1 ? ` (${def.sells[variant]?.label})` : '';
        return addLedger(next, amount, `Sold ${def.name}${vlabel}${val === 'sell-fence' ? ' through the Fence' : full ? ' at full price (this break)' : ''}`);
      }
      if (val.startsWith('slot:')) return { ...c, items: c.items.map((o) => (o.uid === item.uid ? { ...o, slot: val.slice(5) as ItemSlot } : o)) };
      if (val.startsWith('to:')) {
        const f = c.fighters.find((x) => x.id === val.slice(3))!;
        const without = { ...c, items: c.items.filter((o) => o.uid !== item.uid) };
        const slot = autoSlot(rules, without, f, def);
        const fallback = slot === 'stash' ? opts[0] : slot;
        return { ...c, items: c.items.map((o) => (o.uid === item.uid ? { ...o, fighterId: f.id, slot: fallback } : o)) };
      }
      return c;
    });
  };

  return (
    <div className={`chip ${item.kitRef ? 'kit' : ''}`}>
      <RuleLink rule={itemRule(rules, def)}>{def.name}</RuleLink>
      <span className="muted small">{def.source}{def.hands ? ` · ${def.hands}H` : ''}{def.mount ? ' · mount' : ''}{item.kitRef ? ' · kit' : ''}{item.used ? ` · ${rules.crew.gear.singleUse.uses - item.used} left` : ''}</span>
      <SellerControl crew={crew} item={item} update={update} />
      <select className="chip-menu" value="" onChange={(e) => move(e.target.value)} aria-label={`Move ${def.name}`}>
        <option value="">Move…</option>
        {owner && opts.filter((s) => s !== item.slot).map((s) => <option key={s} value={`slot:${s}`}>To {SLOT_LABEL[s]}</option>)}
        {crew.fighters.filter((f) => f.id !== item.fighterId).map((f) => <option key={f.id} value={`to:${f.id}`}>Give to {f.name || 'unnamed fighter'}</option>)}
        {owner && <option value="stash">To the stash</option>}
        {!campaign && !item.kitRef && <option value="remove">Return it to the shop</option>}
        {campaign && sv !== null && variants.map((v, i) => <option key={`s${i}`} value={`sell:${i}`}>Sell{v ? ` (${v})` : ''} for {sellValue(rules, crew, item, false, i)} parts</option>)}
        {campaign && sv !== null && fence && variants.map((v, i) => <option key={`f${i}`} value={`sell-fence:${i}`}>Sell{v ? ` (${v})` : ''} through the Fence for {sellValue(rules, crew, item, true, i)}</option>)}
        {dropSale && <option value="sell-drop">Sell it: {dropSale.title} (a {dropSale.effect.roll} × {dropSale.effect.amount})</option>}
        {campaign && <option value="remove">Lose or discard it</option>}
      </select>
      {sellingDrop && dropSale && (
        <div className="stack-s grow">
          <span className="small">{dropSale.title}: roll a {dropSale.effect.roll}, {dropSale.effect.amount} parts for each pip ({dropSale.section}).</span>
          <RollOrEnter die={dropSale.effect.roll ?? 'd6'} onResult={(n) => update((c) => addLedger({ ...c, items: c.items.filter((o) => o.uid !== item.uid) }, n * (dropSale.effect.amount ?? 0), `Sold ${def.name} (${dropSale.title}, rolled ${n})`))} />
        </div>
      )}
    </div>
  );
}

export function Stash({ crew, update }: { crew: Crew; update: Update }) {
  const items = crew.items.filter((o) => !o.fighterId || o.slot === 'stash');
  return (
    <div className="stash card">
      <h3>Stash <span className="muted small">(items not carried)</span></h3>
      {items.length === 0 ? <p className="muted small">Nothing in the stash.</p> : <div className="chips">{items.map((o) => <ItemChip key={o.uid} crew={crew} item={o} update={update} />)}</div>}
      {crew.phase === 'campaign' && <AddFound update={update} />}
    </div>
  );
}

/** An item the crew found, won or took (finds, pods, story events, repossession): free, into the stash. */
function AddFound({ update }: { update: Update }) {
  const rules = getRules();
  const [id, setId] = useState('');
  const groups = Array.from(new Set(rules.items.map((i) => i.group)));
  return (
    <div className="row gap-s wrap add-found">
      <select aria-label="An item found or taken" value={id} onChange={(e) => setId(e.target.value)}>
        <option value="">Add an item found or taken…</option>
        {groups.map((g) => <optgroup key={g} label={g}>{rules.items.filter((i) => i.group === g).map((i) => <option key={i.id} value={i.id}>{i.name} ({i.source})</option>)}</optgroup>)}
      </select>
      <button className="btn small" disabled={!id} onClick={() => { update((c) => ({ ...c, items: [...c.items, { uid: uid('i'), itemId: id, fighterId: null, slot: 'stash', paid: 0, note: 'found' }] })); setId(''); }}>Add free</button>
    </div>
  );
}

export const fighterLabel = (f: Fighter) => f.name || 'Unnamed fighter';
export const describeType = (f: Fighter) => [f.species, f.type].filter(Boolean).join(', ');
export { Md };

/** Recharge batteries: each Energy restored costs parts, up to the cell's size (14.3). */
export function Recharge({ crew, update }: { crew: Crew; update: Update }) {
  const rules = getRules();
  const [add, setAdd] = useState<Record<string, number>>({});
  const per = rules.crew.campaign.rechargePerEnergy;
  const rows = crew.fighters.map((f) => ({ f, ...battery(rules, crew, f) }));
  const missing = rows.reduce((s, r) => s + (r.max - r.now), 0);
  const want = (r: (typeof rows)[number]) => Math.min(add[r.f.id] ?? 0, r.max - r.now);
  const energy = rows.reduce((s, r) => s + want(r), 0);
  const cost = rechargeCost(rules, energy, crew);
  const ok = energy > 0 && canPayRunningCost(rules, crew, cost);
  const pay = () => {
    update((c) => addLedger({ ...c, fighters: c.fighters.map((f) => { const r = rows.find((x) => x.f.id === f.id)!; return want(r) ? { ...f, energy: r.now + want(r) } : f; }) }, -cost, `Recharged ${energy} Energy`));
    setAdd({});
  };
  return (
    <div className="card stack-s recharge">
      <h3>Recharge batteries <span className="section-tag">§ {per.source}</span></h3>
      <p className="small muted">Batteries do not refill by themselves: {rechargeCost(rules, 1, crew)} part{rechargeCost(rules, 1, crew) === 1 ? '' : 's'} per Energy{rechargeCost(rules, 1, crew) !== per.value ? ' this break' : ''}, up to the cell's size.{missing === 0 ? ' Every battery is full.' : ''}</p>
      {missing > 0 && (
        <>
          <ul className="plain-list stack-s">{rows.map((r) => (
            <li key={r.f.id} className="row gap-s wrap between">
              <span>{fighterLabel(r.f)}</span>
              <span className="row gap-s">
                <span className="pips" aria-label={`Energy ${r.now} of ${r.max}`}>{Array.from({ length: r.max }, (_, i) => <span key={i} className={`epip static ${i < r.now ? 'on' : i < r.now + want(r) ? 'add' : ''}`} />)}</span>
                {r.now < r.max && <>
                  <button className="btn small" aria-label={`Less Energy for ${fighterLabel(r.f)}`} onClick={() => setAdd({ ...add, [r.f.id]: Math.max(0, want(r) - 1) })}>−</button>
                  <button className="btn small" aria-label={`More Energy for ${fighterLabel(r.f)}`} onClick={() => setAdd({ ...add, [r.f.id]: Math.min(r.max - r.now, want(r) + 1) })}>+</button>
                </>}
              </span>
            </li>
          ))}</ul>
          <div className="row gap-s wrap">
            <button className="btn small" onClick={() => setAdd(Object.fromEntries(rows.map((r) => [r.f.id, r.max - r.now])))}>Fill every battery ({rechargeCost(rules, missing, crew)} parts)</button>
            <button className="btn small primary" disabled={!ok} onClick={pay}>Recharge {energy} Energy for {cost} parts</button>
          </div>
          {energy > 0 && !ok && <p className="small err-text">Not enough parts.</p>}
        </>
      )}
    </div>
  );
}

/** A destroyed bot whose core came home: buy the replacement chassis at its hire price (13.3). */
export function Chassis({ crew, update }: { crew: Crew; update: Update }) {
  const rules = getRules();
  const waiting = crew.fighters.filter((f) => f.awaitingChassis);
  if (!waiting.length) return null;
  return (
    <div className="card stack-s">
      <h3>Replacement chassis <span className="section-tag">§ 13.3</span></h3>
      {waiting.map((f) => {
        const price = hirePrice(rules, crew, f);
        return (
          <div key={f.id} className="row gap-s wrap between">
            <span>{fighterLabel(f)}'s core ({f.xp} XP) waits for a new {f.type ?? 'chassis'}.</span>
            <button className="btn small primary" disabled={!canSpend(rules, crew, price)} onClick={() => update((c) => addLedger({ ...c, fighters: c.fighters.map((x) => (x.id === f.id ? { ...x, awaitingChassis: false } : x)) }, -price, `New chassis for ${fighterLabel(f)}`))}>Buy it for {price} parts</button>
          </div>
        );
      })}
    </div>
  );
}

/** The faction rule the crew's subfaction replaces: the player's choice, made at creation (10.1). */
export function ReplacedRulePick({ crew, update }: { crew: Crew; update: Update }) {
  const rules = getRules();
  if (!crew.subfaction) return null;
  return (
    <fieldset className="stack-s replace-pick">
      <legend><strong>Which faction rule does {crew.subfaction}'s rule replace?</strong> <span className="muted small">The replaced rule is gone, with everything that depends on it (10.1).</span></legend>
      {replaceableRules(rules, crew.faction).map((r) => (
        <label key={r.n} className={`option ${crew.replacedRule === r.n ? 'on' : ''}`}>
          <input type="radio" name={`replaced-rule-${crew.id}`} checked={crew.replacedRule === r.n} onChange={() => update((c) => ({ ...c, replacedRule: r.n }))} />
          <span><strong>{r.n}. {r.name}</strong></span>
        </label>
      ))}
    </fieldset>
  );
}

/** The doctor of last resort (14.3): when every fighter would miss the next battle, pay all the parts and heal one. */
export function Doctor({ crew, update }: { crew: Crew; update: Update }) {
  const rules = getRules();
  const doc = rules.crew.campaign.doctor;
  const [who, setWho] = useState('');
  if (!doc || !crew.fighters.length || !crew.fighters.every((f) => f.status === doc.value)) return null;
  const fit = rules.crew.campaign.statuses.value[0];
  const pay = Math.max(0, crew.parts);
  return (
    <div className="card stack-s">
      <h3>The doctor of last resort <span className="section-tag">§ {doc.source}</span></h3>
      <p className="small">Every fighter is {doc.value}. The crew may pay all its parts ({pay}) for advanced medicines from a drop: one fighter is healed and can play the next battle. Lasting injuries stay.</p>
      <div className="row gap-s wrap">
        <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Fighter to heal">
          <option value="">Choose the fighter</option>
          {crew.fighters.map((f) => <option key={f.id} value={f.id}>{fighterLabel(f)}</option>)}
        </select>
        <button className="btn small primary" disabled={!who} onClick={() => update((c) => addLedger({ ...c, fighters: c.fighters.map((f) => (f.id === who ? { ...f, status: fit } : f)) }, -pay, 'The doctor of last resort'))}>Call the doctor</button>
      </div>
    </div>
  );
}

const campaign0 = (crew: Crew) => crew.phase === 'campaign';

/** This break's Spend effects from story events (14.6), shown where they apply. */
export function SpendEffects({ crew }: { crew: Crew }) {
  const rules = getRules();
  const list = (crew.spendEffects ?? []).filter((e) => !e.used);
  if (!list.length) return null;
  const se = rules.crew.campaign.spendEffects;
  const text = (e: NonNullable<Crew['spendEffects']>[number]) =>
    e.kind === 'rechargeDouble' ? `Recharging costs ${se?.value.rechargeMultiplier ?? 2} times as much`
      : e.kind === 'purchase' ? `The first purchase costs ${Math.abs(e.amount ?? 0)} ${(e.amount ?? 0) >= 0 ? 'more' : 'less'}`
      : e.kind === 'hire' ? `The next hire costs ${se?.value.hireExtra ?? 0} more`
      : 'The first sale is at full price';
  return (
    <div className="note small">
      <strong>This break only</strong> <span className="muted">(Spend effects, § {se?.source ?? ''})</span>:{' '}
      {list.map((e, i) => <span key={i}>{text(e)}{e.note ? ` (${e.note})` : ''}{i < list.length - 1 ? '; ' : '.'}</span>)}
    </div>
  );
}

/** Captives (14.4): ours Held by other crews (buy back at the asked price from the break after the next battle),
 *  and the enemy fighters we Hold (bought back by their owner, or Taken at the end of the league). */
export function HeldCaptives({ crew, update }: { crew: Crew; update: Update }) {
  const rules = getRules();
  const hold = rules.crew.campaign.hold;
  const held = crew.held ?? [];
  const prisoners = crew.prisoners ?? [];
  if (!hold || (!held.length && !prisoners.length)) return null;
  const taken = rules.crew.afterBattle.takenFate.value;
  const statuses = rules.crew.campaign.statuses.value;
  const canBuy = (h: (typeof held)[number]) => (crew.breakNo ?? 0) >= h.sinceBreak + hold.value.buyBackAfterBreaks;
  const comeHome = (i: number, price: number, note: string) => update((c) => {
    const h = (c.held ?? [])[i];
    if (!h) return c;
    const next = { ...c, fighters: [...c.fighters, h.fighter], items: [...c.items, ...h.items], held: (c.held ?? []).filter((_, j) => j !== i) };
    return price ? addLedger(next, -price, note) : next;
  });
  return (
    <div className="card stack-s">
      <h3>Captives <span className="section-tag">§ {hold.source}</span></h3>
      {held.map((h, i) => (
        <div key={h.fighter.id} className="row gap-s wrap between">
          <span><strong>{fighterLabel(h.fighter)}</strong> <span className="muted small">Held by {h.captor || 'another crew'}, asked price {h.price}</span></span>
          <span className="row gap-s wrap">
            <button className="btn small primary" disabled={!canBuy(h) || !canSpend(rules, crew, h.price)} onClick={() => comeHome(i, h.price, `Bought back ${h.fighter.name || 'a fighter'}`)}>Buy back ({h.price})</button>
            <button className="btn small" onClick={() => comeHome(i, 0, '')}>Captor wiped out: home free</button>
            <button className="btn small" onClick={() => update((c) => ({ ...c, held: (c.held ?? []).filter((_, j) => j !== i), notes: { ...c.notes, roll: [...c.notes.roll, { id: uid('r'), name: h.fighter.name || 'A fighter', titles: [h.fighter.title, ...h.fighter.titles].filter(Boolean).join(', '), fate: taken, note: 'Not bought back by the end of the league' }] } }))}>End of league: {taken}</button>
          </span>
          {!canBuy(h) && <span className="muted small">They can be bought back from the break after the next battle.</span>}
        </div>
      ))}
      {prisoners.map((p, i) => (
        <div key={p.id} className="row gap-s wrap between">
          <span><strong>{p.name || 'A captive'}</strong> <span className="muted small">of {p.owner || 'another crew'}, Held by us, asked price {p.price}</span></span>
          <span className="row gap-s wrap">
            <select aria-label={`${p.name || 'Captive'}'s state`} value={p.status ?? statuses[0]} onChange={(e) => update((c) => ({ ...c, prisoners: (c.prisoners ?? []).map((x, j) => (j === i ? { ...x, status: e.target.value } : x)) }))}>{statuses.map((s) => <option key={s}>{s}</option>)}</select>
            <button className="btn small primary" onClick={() => update((c) => addLedger({ ...c, prisoners: (c.prisoners ?? []).filter((_, j) => j !== i) }, p.price, `${p.name || 'A captive'} bought back by ${p.owner || 'their crew'}`))}>Bought back: +{p.price}</button>
            <button className="btn small" onClick={() => update((c) => ({ ...c, prisoners: (c.prisoners ?? []).filter((_, j) => j !== i) }))}>Released (end of league, or their crew is gone)</button>
          </span>
        </div>
      ))}
    </div>
  );
}
