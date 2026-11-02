// Every rule the builder enforces, as a function of the data. Each message is
// short and plain and names its rulebook section. Errors block a legal crew;
// warnings do not.
import type { Rules } from '../data/rules';
import type { Crew, Fighter } from './model';
import {
  advancesEarned, captainOf, captainTraitNames, creditFloor, currentRatings, equipped, fighterStats, giftPrice, hasGift, hasMilitaryFrame,
  hasRites, isBot, itemPrice, kitLines, kitPickOptions, partsLeft, riteFromAdvance, ritesAllowed, ritesKnown, ritesPrice, ruleActive,
  slotCapacity, slotLoad, traitBudgetUsed,
} from './crew';

export type Level = 'error' | 'warning';
export type Step = 'faction' | 'rookies' | 'captain' | 'kit' | 'shop' | 'equip' | 'specials' | 'campaign' | 'notes';
export interface Message { level: Level; text: string; section: string; step: Step; fighterId?: string; rule: string }

type Ctx = { rules: Rules; crew: Crew };
type Validator = (c: Ctx) => Message[];

/** A fighter's name, or their place on the roster when unnamed. */
const named = (crew: Crew, f: Fighter) => f.name || `Fighter ${crew.fighters.findIndex((x) => x.id === f.id) + 1} (unnamed)`;
const an = (w: string) => (/^[AEIOU]/i.test(w) ? `An ${w}` : `A ${w}`);

const msg = (rule: string, level: Level, step: Step, section: string, text: string, fighterId?: string): Message => ({ rule, level, step, section, text, fighterId });

export const validators: Record<string, Validator> = {
  faction({ rules, crew }) {
    const out: Message[] = [];
    if (!crew.faction || !rules.faction(crew.faction)) out.push(msg('faction', 'error', 'faction', '11.1', 'Choose a faction.'));
    else if (!crew.subfaction || !rules.faction(crew.faction)!.subfactions.some((s) => s.name === crew.subfaction)) out.push(msg('faction', 'error', 'faction', '11.1', 'Choose a subfaction.'));
    if (!crew.name.trim()) out.push(msg('faction', 'warning', 'faction', '11.1', 'The crew has no name yet.'));
    return out;
  },

  rookieCount({ rules, crew }) {
    const n = rules.crew.creation.startingRookies.value;
    const r = crew.fighters.filter((f) => f.rookie).length;
    return crew.phase === 'creation' && r !== n ? [msg('rookieCount', 'error', 'rookies', '11.1', `A new crew starts with ${n} rookies, not ${r}.`)] : [];
  },

  maxFighters({ rules, crew }) {
    const m = rules.crew.limits.maxFighters;
    return crew.fighters.length > m.value ? [msg('maxFighters', 'error', 'rookies', m.source, `A crew has at most ${m.value} fighters, bots included. This one has ${crew.fighters.length}.`)] : [];
  },

  names({ crew }) {
    return crew.fighters.flatMap((f, i) => (f.name.trim() ? [] : [msg('names', 'warning', 'rookies', '4.1', `Fighter ${i + 1} has no name yet.`, f.id)]));
  },

  ratings({ rules, crew }) {
    const out: Message[] = [];
    const [lo, hi] = rules.crew.limits.ratingRange.value;
    for (const f of crew.fighters) {
      const vals = Object.values(f.baseRatings);
      const ones = vals.filter((v) => v === 1).length;
      if (ones !== 1 || vals.some((v) => v !== 0 && v !== 1)) out.push(msg('ratings', 'error', 'rookies', '4.2', `${named(crew, f)} needs exactly one rating at 1 (a rookie's start), the rest at 0.`, f.id));
      const cur = currentRatings(rules, f);
      for (const [k, v] of Object.entries(cur)) if (v < lo || v > hi) out.push(msg('ratings', 'error', 'campaign', '4.2', `${named(crew, f)}'s ${k} is ${v}; ratings run from ${lo} to ${hi}.`, f.id));
    }
    return out;
  },

  botRating({ rules, crew }) {
    const r = rules.crew.limits.botForbiddenRating;
    return crew.fighters.filter((f) => isBot(rules, f) && currentRatings(rules, f)[r.value] > 0)
      .map((f) => msg('botRating', 'error', 'rookies', r.source, `${named(crew, f)} is a bot: a bot never has ${r.value}.`, f.id));
  },

  species({ rules, crew }) {
    const out: Message[] = [];
    const fr = rules.factionRules(crew.faction ?? '');
    const playable = rules.crew.limits.playableSpecies.value;
    for (const f of crew.fighters) {
      if (isBot(rules, f)) {
        if (!fr?.specials.bots) out.push(msg('species', 'error', 'rookies', rules.crew.limits.botsOnlyFor.source, `${named(crew, f)} is a bot. Only ${rules.crew.limits.botsOnlyFor.value} fields bots.`, f.id));
      } else if (!playable.includes(f.species)) out.push(msg('species', 'error', 'rookies', '4.3', `${named(crew, f)} has an unknown species, ${f.species}.`, f.id));
    }
    return out;
  },

  types({ rules, crew }) {
    const out: Message[] = [];
    const fr = rules.factionRules(crew.faction ?? '');
    const fac = rules.faction(crew.faction ?? '');
    if (!fr || !fac) return out;
    const names = fac.types.map((t) => t.name);
    for (const f of crew.fighters) {
      if (fr.types && !f.type) out.push(msg('types', 'error', 'rookies', '4.4, 12.1', `${named(crew, f)} needs a type: every fighter of ${fac.name} takes one.`, f.id));
      else if (fr.types && f.type && !names.includes(f.type)) out.push(msg('types', 'error', 'rookies', fac.section, `${f.type} is not a type of ${fac.name}.`, f.id));
      else if (!fr.types && f.type) out.push(msg('types', 'error', 'rookies', '4.4', `${fac.name} have no fighter types.`, f.id));
      const need = f.type ? fr.typeSpecies?.[f.type] : undefined;
      if (need && f.species !== need) out.push(msg('types', 'error', 'rookies', fac.section, `${an(f.type!)} is ${need === rules.crew.limits.botSpecies.value ? 'a bot chassis' : `a ${need}`}, not ${f.species}.`, f.id));
      if (!need && fr.typeSpecies && isBot(rules, f)) out.push(msg('types', 'error', 'rookies', fac.section, `${named(crew, f)} is a bot, so their type must be a bot chassis.`, f.id));
      const only = f.type ? fr.typeGrants?.[f.type]?.speciesOnly : undefined;
      if (only && !only.includes(f.species)) out.push(msg('types', 'error', 'rookies', fac.section, `${an(f.type!)} must be ${only.join(' or ')}, not ${f.species}.`, f.id));
    }
    if (fr.fixedRookies && crew.phase === 'creation') {
      const got = crew.fighters.filter((f) => f.rookie).map((f) => f.type ?? '').sort();
      const want = [...fr.fixedRookies].sort();
      if (got.join('|') !== want.join('|')) out.push(msg('types', 'error', 'rookies', fac.section, `${fac.name}'s four rookies are one each of: ${fr.fixedRookies.join(', ')}.`));
    }
    return out;
  },

  captain({ rules, crew }) {
    const out: Message[] = [];
    const cap = captainOf(crew);
    const fr = rules.factionRules(crew.faction ?? '');
    if (!cap) return [msg('captain', 'error', 'captain', '11.2', 'Choose a captain.')];
    if (fr?.captainType && cap.type !== fr.captainType && crew.phase === 'creation') out.push(msg('captain', 'error', 'captain', rules.faction(crew.faction!)!.section, `The captain of ${crew.faction} is the ${fr.captainType}.`));
    const n = rules.crew.creation.captainTraitsAtStart;
    const has = cap.captainTraits.filter((t) => !t.retired).length;
    if (has < n.value) out.push(msg('captain', 'error', 'captain', n.source, `${named(crew, cap)} is captain and takes ${n.value} captain trait.`, cap.id));
    if (crew.phase === 'creation' && has > n.value) out.push(msg('captain', 'error', 'captain', n.source, `A new captain takes only ${n.value} captain trait.`, cap.id));
    for (const f of crew.fighters) {
      if (f.id !== cap.id && (f.captainTraits.some((t) => !t.retired) || f.advances.some((a) => a.kind === 'captain' && !a.retired)))
        out.push(msg('captain', 'error', 'captain', '11.2', `${named(crew, f)} is not the captain, so cannot have captain traits.`, f.id));
    }
    return out;
  },

  kit({ rules, crew }) {
    const out: Message[] = [];
    for (const l of kitLines(rules, crew)) {
      if (l.pick) {
        if (!l.itemId) out.push(msg('kit', 'error', 'kit', rules.faction(crew.faction!)!.section, `Choose the starting kit: ${l.label}.`));
        else if (!kitPickOptions(rules, crew, l.pick).some((i) => i.id === l.itemId)) out.push(msg('kit', 'error', 'kit', rules.faction(crew.faction!)!.section, `That starting kit choice is not allowed: ${l.label}.`));
      } else if (l.itemId && !rules.item(l.itemId)) out.push(msg('kit', 'error', 'kit', 'chapter 12', `Starting kit item not found in the shop data: ${l.label}.`));
    }
    return out;
  },

  budget({ rules, crew }) {
    const left = partsLeft(rules, crew);
    const floor = creditFloor(rules, crew);
    if (left < floor.value) {
      return [msg('budget', 'error', 'shop', floor.rule ? rules.faction(crew.faction!)!.section : '14.2',
        floor.value < 0 ? `The crew is ${-left} parts in debt; ${crew.faction} may go only ${-floor.value} into debt.` : `Over budget by ${-left} parts. A crew's parts never go below 0.`)];
    }
    if (left < 0) return [msg('budget', 'warning', 'shop', rules.faction(crew.faction!)!.section, `The crew is ${-left} parts in debt on credit. It buys and hires nothing more until the debt is paid.`)];
    return [];
  },

  seller({ rules, crew }) {
    const out: Message[] = [];
    for (const o of crew.items) {
      const d = rules.item(o.itemId);
      if (!d || o.kitRef) continue;
      if (o.seller === 'needed') out.push(msg('seller', 'warning', 'shop', '11.3', `${d.name} (old stock) has no seller yet: roll for one or tick "found".`, o.fighterId ?? undefined));
      if (o.seller === 'none') out.push(msg('seller', 'error', 'shop', '11.3', `No seller for the ${d.name} this break: remove it.`, o.fighterId ?? undefined));
    }
    return out;
  },

  restricted({ rules, crew }) {
    const r = rules.crew.gear.restrictedItems;
    const out: Message[] = [];
    for (const o of crew.items) {
      const d = rules.item(o.itemId);
      const rule = d && r.value.find((x) => x.key === d.key);
      if (rule && !rule.factions.includes(crew.faction ?? '')) out.push(msg('restricted', 'error', 'shop', r.source, `Only ${rule.factions.join(', ')} can have a ${d!.name}.`));
    }
    return out;
  },

  drops({ rules, crew }) {
    if (crew.phase !== 'creation' || rules.crew.creation.dropsForSale.value) return [];
    return crew.items.filter((o) => rules.item(o.itemId)?.source === 'drop' && !o.kitRef)
      .map(() => msg('drops', 'error', 'shop', rules.crew.creation.dropsForSale.source, 'Drops are never for sale: a new crew cannot start with one.'));
  },

  slots({ rules, crew }) {
    const out: Message[] = [];
    const g = rules.crew.gear;
    for (const f of crew.fighters) {
      const items = equipped(crew, f, rules);
      const w = named(crew, f);
      for (const s of ['set1', 'set2'] as const) {
        const load = slotLoad(rules, crew, f, s);
        if (load > g.handsPerSet.value) out.push(msg('slots', 'error', 'equip', g.handsPerSet.source, `${w}'s ${s === 'set1' ? 'first' : 'second'} Hands set holds ${load} Hands of items; a set holds up to ${g.handsPerSet.value}.`, f.id));
      }
      const military = hasMilitaryFrame(rules, crew, f);
      const body = items.filter((o) => o.slot === 'body');
      if (military && body.length) out.push(msg('slots', 'error', 'equip', '7.1, 7.5', `${w} wears a military frame, which fills the Body slot: no armour as well.`, f.id));
      else if (body.length > g.bodySlots.value) out.push(msg('slots', 'error', 'equip', g.bodySlots.source, `${w} wears ${body.length} armours; the Body slot holds ${g.bodySlots.value}.`, f.id));
      const frame = items.filter((o) => o.slot === 'frame');
      if (frame.length > g.frameSlots.value) out.push(msg('slots', 'error', 'equip', g.frameSlots.source, `${w} wears ${frame.length} frames; the Frame slot holds ${g.frameSlots.value}.`, f.id));
      if (frame.length && !g.heavyArmourWithFrame.value && body.some((o) => o.def?.key === g.heavyArmourKey.value))
        out.push(msg('slots', 'error', 'equip', g.heavyArmourWithFrame.source, `Heavy armour cannot be worn with a frame (${w}).`, f.id));
      if (frame.some((o) => o.def?.key === g.frameKeys.value.civilian)) {
        const ok = g.civilianFrameArmour.value.map((a) => `${a.toLowerCase()} armour`);
        for (const b of body) if (b.def && !ok.includes(b.def.key) && b.def.key !== g.heavyArmourKey.value)
          out.push(msg('slots', 'error', 'equip', g.civilianFrameArmour.source, `A civilian frame is worn only with ${g.civilianFrameArmour.value.join(' or ').toLowerCase()} armour (${w}).`, f.id));
      }
      const belt = slotLoad(rules, crew, f, 'belt');
      if (belt > g.beltSlots.value) out.push(msg('slots', 'error', 'equip', g.beltSlots.source, `${w}'s belt holds ${belt} items; a belt has ${g.beltSlots.value} slots.`, f.id));
      const mount = items.filter((o) => o.slot === 'mount');
      if (mount.length && !military) out.push(msg('slots', 'error', 'equip', g.mountWeapons.source, `${w} has no military frame, so no weapon mount. ${mount[0].def?.name ?? 'That weapon'} needs one.`, f.id));
      else if (mount.length > 1) out.push(msg('slots', 'error', 'equip', g.mountWeapons.source, `A weapon mount carries one weapon (${w}).`, f.id));
      for (const o of items) {
        if (!o.def) continue;
        if (o.def.mount && o.slot !== 'mount') out.push(msg('slots', 'error', 'equip', '7.3, 7.5', `The ${o.def.name} is too big to hold: only a military frame's weapon mount carries it (${w}).`, f.id));
        if (o.slot === 'fitted') {
          const inj = g.prosthetics.value[o.def.key];
          if (!inj || !f.injuries.includes(inj)) out.push(msg('slots', 'error', 'equip', g.prosthetics.source, `A ${o.def.name} is fitted only in place of a ${inj ?? 'lost limb'} (${w} has none).`, f.id));
        }
      }
      const cap = slotCapacity(rules, crew, f, 'fitted');
      if (items.filter((o) => o.slot === 'fitted').length > cap) out.push(msg('slots', 'error', 'equip', '13.2', `${w} has too many prosthetics fitted.`, f.id));
    }
    return out;
  },

  gift({ rules, crew }) {
    const out: Message[] = [];
    const gs = rules.crew.limits.giftSpecies;
    const max = rules.crew.limits.maxGifted;
    const gifted = crew.fighters.filter((f) => hasGift(rules, crew, f));
    for (const f of gifted) {
      if (!gs.value.includes(f.species)) out.push(msg('gift', 'error', 'specials', gs.source, `${an(f.species)} can't have the gift. Only ${gs.value.join(' and ')}s can (${gs.source.split(',')[0]}).`, f.id));
      if (f.gift && giftPrice(rules, crew, f) === null) out.push(msg('gift', 'error', 'specials', '11.4', `${crew.faction} may not have psions (${named(crew, f)} has the gift).`, f.id));
    }
    if (gifted.length > max.value) out.push(msg('gift', 'error', 'specials', max.source, `A crew never has more than ${max.value} gifted fighters; this one has ${gifted.length}.`));
    return out;
  },

  rites({ rules, crew }) {
    const out: Message[] = [];
    for (const f of crew.fighters) {
      if (f.rites && ritesPrice(rules, crew, f) === null) out.push(msg('rites', 'error', 'specials', '11.4', `${crew.faction} cannot buy Rites (${named(crew, f)}).`, f.id));
      const allowed = ritesAllowed(rules, crew, f);
      const chosen = f.ritesKnown.length;
      if (!hasRites(rules, crew, f) && chosen) out.push(msg('rites', 'error', 'specials', '8.3', `${named(crew, f)} knows rites but has no Rites.`, f.id));
      else if (chosen > allowed) out.push(msg('rites', 'error', 'specials', '8.3', `${named(crew, f)} may know ${allowed} rite${allowed === 1 ? '' : 's'} from Rites, not ${chosen}.`, f.id));
      else if (hasRites(rules, crew, f) && chosen < allowed) out.push(msg('rites', 'warning', 'specials', '8.3', `${named(crew, f)} has Rites: choose ${allowed - chosen} more rite${allowed - chosen === 1 ? '' : 's'} they know.`, f.id));
      for (const r of f.ritesKnown) if (!rules.rites.includes(r)) out.push(msg('rites', 'error', 'specials', '8.3', `${r} is not a rite.`, f.id));
      const known = ritesKnown(rules, f);
      const carrier = !!rules.factionRules(crew.faction ?? '')?.typeGrants?.[f.type ?? '']?.carriesRelics;
      for (const o of equipped(crew, f, rules)) {
        if (o.def?.kind !== 'relic') continue;
        if (!hasRites(rules, crew, f)) { if (!carrier) out.push(msg('rites', 'warning', 'specials', '8.3', `${named(crew, f)} carries the ${o.def.name} but has no Rites: only a priest can use relics.`, f.id)); }
        else if (o.def.rite && !known.includes(o.def.rite)) out.push(msg('rites', 'warning', 'specials', '8.3', `${named(crew, f)} carries the ${o.def.name} (${o.def.rite}) but does not know that rite, so cannot use it.`, f.id));
      }
    }
    return out;
  },

  traitBudget({ rules, crew }) {
    const b = rules.crew.limits.traitBudget;
    return crew.fighters.filter((f) => traitBudgetUsed(f) > b.value)
      .map((f) => msg('traitBudget', 'error', 'campaign', b.source, `${named(crew, f)} has ${traitBudgetUsed(f)} trait lines from advances, Legends and captain traits; the card holds ${b.value}. Retire one.`, f.id));
  },

  advances({ rules, crew }) {
    const out: Message[] = [];
    const e = rules.crew.experience;
    const forbid = rules.crew.limits.botForbiddenRating.value;
    for (const f of crew.fighters) {
      const w = named(crew, f);
      const earned = advancesEarned(rules, f.xp);
      if (f.advances.length > earned) out.push(msg('advances', 'error', 'campaign', e.ladder.source, `${w} has ${f.advances.length} advances but ${f.xp} XP earns ${earned}.`, f.id));
      const ratings: Record<string, number> = { ...f.baseRatings };
      const seen = new Set<string>();
      let lastRating = false;
      let aces = 0;
      f.advances.forEach((a, i) => {
        const n = i + 1;
        const isRating = a.kind === 'rating' || a.kind === 'ace';
        if (isRating && lastRating && e.noTwoRatingAdvancesInARow.value) out.push(msg('advances', 'error', 'campaign', e.noTwoRatingAdvancesInARow.source, `${w}: advance ${n} is a rating advance right after another. The advance after a rating advance must be a trait.`, f.id));
        lastRating = isRating;
        if (a.kind === 'rating') {
          if ((ratings[a.rating] ?? 0) >= e.ratingAdvanceMax.value) out.push(msg('advances', 'error', 'campaign', e.ratingAdvanceMax.source, `${w}: a rating advance takes ${a.rating} from 0 to 1 or 1 to 2. Going past ${e.ratingAdvanceMax.value} needs the Ace.`, f.id));
          if (isBot(rules, f) && a.rating === forbid && e.botsNeverRaiseNerve.value) out.push(msg('advances', 'error', 'campaign', e.botsNeverRaiseNerve.source, `${w} is a bot: a bot can never raise ${forbid}.`, f.id));
          ratings[a.rating] = (ratings[a.rating] ?? 0) + 1;
        } else if (a.kind === 'ace') {
          aces++;
          if (n < e.aceFromAdvanceNumber.value) out.push(msg('advances', 'error', 'campaign', e.aceFromAdvanceNumber.source, `${w}: the Ace can be taken from the ${e.aceFromAdvanceNumber.value}rd advance on.`, f.id));
          if ((ratings[a.rating] ?? 0) !== e.aceTo.value - 1) out.push(msg('advances', 'error', 'campaign', e.aceFromAdvance.source, `${w}: the Ace takes a rating of ${e.aceTo.value - 1} to ${e.aceTo.value}; ${a.rating} is ${ratings[a.rating] ?? 0}.`, f.id));
          ratings[a.rating] = (ratings[a.rating] ?? 0) + 1;
        } else if (a.kind === 'trait') {
          const def = rules.advanceDefs.find((d) => d.name === a.name && d.list === a.list);
          if (!def) out.push(msg('advances', 'error', 'campaign', '13.4', `${w}: ${a.name} is not on the ${a.list} list.`, f.id));
          else {
            if (def.list !== e.commonList.value && (ratings[def.list] ?? 0) < e.traitListNeedsRating.value)
              out.push(msg('advances', 'error', 'campaign', e.traitListNeedsRating.source, `${w}: the ${def.list} list needs ${def.list} ${e.traitListNeedsRating.value} or more when the advance is taken.`, f.id));
            if (def.needs) {
              const has = (def.needs === e.ritesAdvance.value && (f.rites || rules.factionRules(crew.faction ?? '')?.typeGrants?.[f.type ?? '']?.rites)) || f.advances.slice(0, i).some((x) => x.kind === 'trait' && x.name === def.needs);
              if (!has) out.push(msg('advances', 'error', 'campaign', '13.4', `${w}: ${a.name} needs ${def.needs} first.`, f.id));
            }
            const rite = riteFromAdvance(rules, a.name);
            if (rite && f.ritesKnown.includes(rite)) out.push(msg('advances', 'error', 'campaign', '8.3', `${w} already knows the rite of ${rite}.`, f.id));
          }
          if (seen.has(a.name)) out.push(msg('advances', 'error', 'campaign', '13.4', `${w} has ${a.name} twice: a fighter takes each trait once.`, f.id));
          seen.add(a.name);
        } else if (a.kind === 'captain') {
          if (seen.has(a.name) || f.captainTraits.some((t) => t.name === a.name)) out.push(msg('advances', 'error', 'campaign', '11.2', `${w} has the captain trait ${a.name} twice.`, f.id));
          seen.add(a.name);
        }
      });
      if (aces > 1) out.push(msg('advances', 'error', 'campaign', e.aceFromAdvance.source, `${w}: the Ace is taken once in a career.`, f.id));
    }
    return out;
  },

  injuries({ rules, crew }) {
    const out: Message[] = [];
    const max = rules.crew.limits.maxLastingInjuries;
    const injuryNames = rules.injuries.map((i) => i.name);
    const glitchNames = rules.glitches.map((i) => i.name);
    for (const f of crew.fighters) {
      if (f.injuries.length > max.value) out.push(msg('injuries', 'error', 'campaign', max.source, `${named(crew, f)} has ${f.injuries.length} lasting injuries; a card holds ${max.value}.`, f.id));
      for (const i of f.injuries) {
        if (isBot(rules, f) && injuryNames.includes(i) && !glitchNames.includes(i)) out.push(msg('injuries', 'error', 'campaign', '13.3', `${named(crew, f)} is a bot: bots take glitches, not injuries (${i}).`, f.id));
        if (!isBot(rules, f) && glitchNames.includes(i) && !injuryNames.includes(i)) out.push(msg('injuries', 'error', 'campaign', '13.3', `${named(crew, f)} is not a bot, so cannot have the glitch ${i}.`, f.id));
      }
    }
    return out;
  },

  typeRules({ rules, crew }) {
    const tr = rules.factionRules(crew.faction ?? '')?.typeRules ?? {};
    return crew.fighters.filter((f) => f.type && tr[f.type]?.noTitle && f.title)
      .map((f) => msg('typeRules', 'error', 'campaign', tr[f.type!].source, `${named(crew, f)} is ${an(f.type!).toLowerCase()}, who can never take a title.`, f.id));
  },

  notes({ rules, crew }) {
    const out: Message[] = [];
    const L = rules.crew.limits;
    if (crew.notes.tags.length > L.maxTags.value) out.push(msg('notes', 'error', 'notes', L.maxTags.source, `A crew has at most ${L.maxTags.value} tags.`));
    if (crew.notes.contacts.length > L.maxContacts.value) out.push(msg('notes', 'error', 'notes', L.maxContacts.source, `A crew holds at most ${L.maxContacts.value} contacts.`));
    return out;
  },
};

export function validate(rules: Rules, crew: Crew): Message[] {
  const out: Message[] = [];
  for (const v of Object.values(validators)) out.push(...v({ rules, crew }));
  return out;
}

export const errorsOf = (m: Message[]) => m.filter((x) => x.level === 'error');

// re-exported for the UI's convenience
export { fighterStats, itemPrice, captainTraitNames, ruleActive };
