import { getRules } from '../src/data/rules';
import { newCrew, setFaction, syncKit, autoSlot } from '../src/engine/crew';
import { uid, type Crew, type Fighter, type ItemSlot } from '../src/engine/model';

export const rules = getRules();

/** A crew of the given faction with four named rookies (Fight 1), captain = first, one captain trait. */
export function crewOf(faction: string, subfaction?: string, edit?: (c: Crew) => Crew): Crew {
  let c = newCrew(rules);
  c.name = 'Test crew';
  c = setFaction(rules, c, faction);
  const fac = rules.faction(faction)!;
  c.subfaction = subfaction ?? fac.subfactions[0].name;
  const fr = rules.factionRules(faction)!;
  const types = fac.types.map((t) => t.name);
  const human = rules.crew.limits.playableSpecies.value[0];
  const plainType = types.find((t) => !fr.typeGrants?.[t] && (fr.typeSpecies?.[t] ?? human) === human) ?? null;
  c.fighters = c.fighters.map((f, i) => {
    const type = fr.types ? f.type ?? plainType : null;
    return {
      ...f,
      name: `Rookie ${i + 1}`,
      type,
      species: (type && fr.typeSpecies?.[type]) || f.species,
      baseRatings: { ...f.baseRatings, [rules.crew.limits.ratingNames.value[0]]: 1 },
    };
  });
  if (!c.captainId) c.captainId = c.fighters[0].id;
  c.fighters = c.fighters.map((f) => (f.id === c.captainId ? { ...f, captainTraits: [{ name: rules.captainTraits[0].name }] } : f));
  c = syncKit(rules, c);
  // Fill kit choices with the first legal option.
  return edit ? edit(c) : c;
}

export function patchFighter(c: Crew, i: number, p: Partial<Fighter>): Crew {
  return { ...c, fighters: c.fighters.map((f, j) => (j === i ? { ...f, ...p } : f)) };
}

export function give(c: Crew, i: number | null, itemId: string, slot?: ItemSlot, extra: object = {}): Crew {
  const def = rules.item(itemId);
  if (!def) throw new Error(`no item ${itemId}`);
  const f = i === null ? null : c.fighters[i];
  const s = slot ?? (f ? autoSlot(rules, c, f, def) : 'stash');
  return { ...c, items: [...c.items, { uid: uid('i'), itemId, fighterId: f && s !== 'stash' ? f.id : null, slot: s, seller: def.source === 'old stock' ? 'found' : undefined, ...extra }] };
}

export const ids = (m: { rule: string; level: string }[], level = 'error') => m.filter((x) => x.level === level).map((x) => x.rule);
