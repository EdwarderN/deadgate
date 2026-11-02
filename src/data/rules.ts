// Loads every file in data/, validates it, and builds the lookups the app uses.
// Nothing here knows a price, a name or a number of the game: it all comes
// from data/generated (the rulebook) and data/manual/crew-rules.json.
import { z } from 'zod';
import { crewRulesSchema, generatedSchemas, outcomesSchema, type Outcomes, type CatalogItem, type CrewRules, type Faction, type FactionRules, type Row } from './schema';

import _meta from '../../data/generated/_meta.json';
import species from '../../data/generated/species.json';
import slots from '../../data/generated/slots.json';
import weapon_traits from '../../data/generated/weapon_traits.json';
import weapons from '../../data/generated/weapons.json';
import armour from '../../data/generated/armour.json';
import armour_by_source from '../../data/generated/armour_by_source.json';
import frames from '../../data/generated/frames.json';
import robo_arms from '../../data/generated/robo_arms.json';
import grenades from '../../data/generated/grenades.json';
import devices from '../../data/generated/devices.json';
import medical_kits from '../../data/generated/medical_kits.json';
import drop_items from '../../data/generated/drop_items.json';
import relics from '../../data/generated/relics.json';
import psionic_powers from '../../data/generated/psionic_powers.json';
import captain_traits from '../../data/generated/captain_traits.json';
import shop from '../../data/generated/shop.json';
import recruits from '../../data/generated/recruits.json';
import factions from '../../data/generated/factions.json';
import research_studies from '../../data/generated/research_studies.json';
import xp_ladder from '../../data/generated/xp_ladder.json';
import advances from '../../data/generated/advances.json';
import injuries_light from '../../data/generated/injuries_light.json';
import injuries_heavy from '../../data/generated/injuries_heavy.json';
import prosthetics from '../../data/generated/prosthetics.json';
import glitches from '../../data/generated/glitches.json';
import recovery_words from '../../data/generated/recovery_words.json';
import silly_traits from '../../data/generated/silly_traits.json';
import deeds from '../../data/generated/deeds.json';
import rumours from '../../data/generated/rumours.json';
import tags from '../../data/generated/tags.json';
import contacts from '../../data/generated/contacts.json';
import tasks from '../../data/generated/tasks.json';
import glossary from '../../data/generated/glossary.json';
import catalog from '../../data/generated/catalog.json';
import difficulties from '../../data/generated/difficulties.json';
import severity from '../../data/generated/severity.json';
import states from '../../data/generated/states.json';
import actions from '../../data/generated/actions.json';
import consequences from '../../data/generated/consequences.json';
import lasting_conditions from '../../data/generated/lasting_conditions.json';
import clashes from '../../data/generated/clashes.json';
import voices from '../../data/generated/voices.json';
import drop_table from '../../data/generated/drop_table.json';
import generic_xp from '../../data/generated/generic_xp.json';
import deed_tiers from '../../data/generated/deed_tiers.json';
import word_audiences from '../../data/generated/word_audiences.json';
import injury_tables from '../../data/generated/injury_tables.json';
import bot_words from '../../data/generated/bot_words.json';
import story_rows from '../../data/generated/story_rows.json';
import story_events from '../../data/generated/story_events.json';
import task_tables from '../../data/generated/task_tables.json';
import finds from '../../data/generated/finds.json';
import league_points from '../../data/generated/league_points.json';
import bot_states from '../../data/generated/bot_states.json';
import gear_failure from '../../data/generated/gear_failure.json';
import grenade_scatter from '../../data/generated/grenade_scatter.json';
import grenade_distance from '../../data/generated/grenade_distance.json';
import prompt_targets from '../../data/generated/prompt_targets.json';
import melee_results from '../../data/generated/melee_results.json';
import melee_dice from '../../data/generated/melee_dice.json';
import shot_results from '../../data/generated/shot_results.json';
import shooting_helps from '../../data/generated/shooting_helps.json';
import shooting_protects from '../../data/generated/shooting_protects.json';
import reactions from '../../data/generated/reactions.json';
import force_field_saves from '../../data/generated/force_field_saves.json';
import terrain_traits from '../../data/generated/terrain_traits.json';
import doors from '../../data/generated/doors.json';
import deployment from '../../data/generated/deployment.json';
import world_table from '../../data/generated/world_table.json';
import npm from '../../data/generated/npm.json';
import worlds from '../../data/generated/worlds.json';
import final from '../../data/generated/final.json';
import crewRulesJson from '../../data/manual/crew-rules.json';
import outcomesJson from '../../data/manual/outcomes.json';

export const rawData = {
  _meta, species, slots, weapon_traits, weapons, armour, armour_by_source, frames, robo_arms, grenades, devices,
  medical_kits, drop_items, relics, psionic_powers, captain_traits, shop, recruits, factions, research_studies,
  xp_ladder, advances, injuries_light, injuries_heavy, prosthetics, glitches, recovery_words, silly_traits, deeds,
  rumours, tags, contacts, tasks, glossary, catalog,
  difficulties, severity, states, actions, consequences, lasting_conditions, clashes, voices, drop_table, generic_xp,
  deed_tiers, word_audiences, injury_tables, bot_words, story_rows, story_events, task_tables, finds, league_points, bot_states,
  gear_failure, grenade_scatter, grenade_distance, prompt_targets, melee_results, melee_dice, shot_results, shooting_helps, shooting_protects, reactions, force_field_saves, terrain_traits, doors, deployment, world_table, npm, worlds, final,
};

export type RawData = typeof rawData;
type Tables = Record<string, Row[]>;
/** The data with its keyed tables typed loosely, so new rows or keys from the book need no code change. */
export type Data = Omit<RawData, 'deed_tiers' | 'injury_tables' | 'task_tables' | 'consequences' | 'clashes' | 'voices' | 'story_events' | 'gear_failure'> & {
  gear_failure: Tables;
  deed_tiers: Record<string, { tier: string; xp: number }>;
  injury_tables: Tables; task_tables: Tables; consequences: Tables; clashes: Tables; story_events: Tables;
  voices: Record<string, { intro: string; rows: Row[] }>;
};

// ---------- small text helpers ----------
/** Strip markdown bold. */
export const plain = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1').trim();
/** 'Tool-blade (a wrench...)' -> 'tool-blade', as the extractor keys items. */
export const keyOf = (s: string) => plain(s).toLowerCase().replace(/\s*\(.*?\)/g, '').trim();
/** '**Jumpy** ("Flinch")' -> { name: 'Jumpy', title: 'Flinch' } */
export function nameAndTitle(s: string): { name: string; title: string | null; rest: string } {
  const m = s.match(/^\*\*(.+?)\*\*\s*(?:\((.+?)\))?\s*:?\s*(.*)$/s);
  if (!m) return { name: plain(s), title: null, rest: '' };
  const name = m[1].replace(/[.:]$/, '').trim();
  let title: string | null = m[2] ? m[2].replace(/^"|"$/g, '').replace(/^“|”$/g, '') : null;
  if (title === 'same title') title = name;
  return { name, title, rest: m[3].trim() };
}

// ---------- derived types ----------
export type Source = 'copy' | 'old stock' | 'drop';
export type SlotKind = 'hands' | 'body' | 'frame' | 'belt' | 'fitted';

export interface RuleRef {
  title: string;
  section: string;
  /** label/text pairs, or plain text; text keeps markdown bold */
  lines: [string, string][];
}

export interface ItemDef {
  id: string;
  key: string;
  name: string;
  source: Source;
  price: number | null;
  kind: string;
  group: string;
  note: string | null;
  rules: Record<string, unknown>;
  slot: SlotKind;
  hands: number;
  mount: boolean;
  belt: number;
  handsBonus: number;
  traits: string[];
  rite: string | null;
  section: string;
  forSale: boolean;
}

export interface SpeciesDef { name: string; moveText: string; move: number | null; trait: string }
export interface AdvanceDef { list: string; name: string; rule: string; needs: string | null }
export interface NamedRule { name: string; title: string | null; text: string; table: string }
export interface LegendDef { name: string; title: string | null; text: string; from: string }
export interface ChassisDef { move: number; hands: number }

export interface Rules {
  version: string;
  meta: z.infer<typeof generatedSchemas._meta>;
  data: Data;
  crew: CrewRules;
  outcomes: Outcomes;
  factions: Faction[];
  faction(name: string): Faction | undefined;
  factionRules(name: string): FactionRules | undefined;
  species: SpeciesDef[];
  items: ItemDef[];
  shopItems: ItemDef[];
  item(id: string): ItemDef | undefined;
  recruitPrices: Record<string, number>;
  chassis: Record<string, ChassisDef>;
  rites: string[];
  advanceDefs: AdvanceDef[];
  advanceLists: string[];
  captainTraits: { name: string; rule: string }[];
  injuries: NamedRule[];
  glitches: NamedRule[];
  silly: NamedRule[];
  legends: LegendDef[];
  deeds: { id: string; tier: string; name: string; text: string; legend: string | null }[];
  tags: { name: string; gained: string; text: string }[];
  contacts: { name: string; text: string }[];
  weaponTraits: Record<string, string>;
  powers: { name: string; number: string; text: string }[];
  section(kind: string): string;
  thresholds(count: number): number[];
}

// ---------- building ----------
export function validateRaw(raw: RawData) {
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(generatedSchemas)) {
    const res = (schema as z.ZodTypeAny).safeParse((raw as Record<string, unknown>)[name]);
    if (!res.success) throw new Error(`data/generated/${name}.json does not match its schema: ${res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    out[name] = res.data;
  }
  return out;
}

export function validateCrewRules(json: unknown): CrewRules {
  const res = crewRulesSchema.safeParse(json);
  if (!res.success) throw new Error(`data/manual/crew-rules.json does not match its schema: ${res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  return res.data;
}

function parseRecruits(rows: Row[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const label = r.recruit;
    if (label.startsWith('+') || /^(The gift|Rites)\b/.test(label)) continue;
    const colon = label.match(/^.*?:\s*(.+)$/);
    if (colon) {
      const names = colon[1].split(' / ').map((s) => s.trim());
      const prices = r.price.split(' / ').map((s) => parseInt(s, 10));
      names.forEach((n, i) => (out[n] = prices[i] ?? prices[0]));
    } else {
      const price = parseInt(r.price, 10);
      label.replace(/\s*\(.*\)/, '').split(',').map((s) => s.trim()).filter(Boolean).forEach((n) => (out[n] = price));
    }
  }
  return out;
}

function buildItems(crew: CrewRules, raw: RawData, cat: CatalogItem[]): ItemDef[] {
  const kindSlots = crew.gear.kindSlots.value;
  const sections = crew.sections.value;
  const traitNames = raw.weapon_traits.map((t) => plain(t.Trait));
  const mountHands = crew.gear.mountWeapons.value.hands;

  const make = (base: Omit<ItemDef, 'slot' | 'hands' | 'mount' | 'belt' | 'handsBonus' | 'traits' | 'rite' | 'section' | 'id'>): ItemDef => {
    const rule = kindSlots[base.kind];
    if (!rule) throw new Error(`crew-rules.json gear.kindSlots has no entry for item kind '${base.kind}'`);
    let slot = rule.slot as SlotKind | undefined;
    let hands = rule.hands ?? 0;
    let belt = rule.belt ?? 0;
    let mount = false;
    if (rule.handsFrom) {
      const v = String(base.rules[rule.handsFrom] ?? '');
      if (v === mountHands) mount = true;
      else hands = parseInt(v, 10) || 0;
    }
    if (rule.slotFrom) {
      const v = plain(String(base.rules[rule.slotFrom] ?? ''));
      const m = v.match(/^(Hands|Belt|Body|Frame)\s*(\d+)?/i);
      if (!m) throw new Error(`Cannot read the slot '${v}' of ${base.name}`);
      slot = m[1].toLowerCase() as SlotKind;
      if (slot === 'hands') hands = parseInt(m[2] ?? '1', 10);
      if (slot === 'belt') belt = parseInt(m[2] ?? '1', 10);
    }
    if (!slot) slot = 'hands';
    const traitsText = String(base.rules.Traits ?? '');
    const traits = traitsText ? traitsText.split(',').map((t) => t.replace(/\(.*?\)/g, '').replace(/\..*$/, '').trim()).filter((t) => traitNames.includes(t)) : [];
    const riteM = String(base.rules['Relic (rite)'] ?? '').match(/\((\w+)\)\s*$/);
    return {
      ...base,
      id: `${base.key}|${base.source}`,
      slot, hands, belt, mount,
      handsBonus: rule.handsBonus ?? 0,
      traits,
      rite: riteM ? riteM[1] : null,
      section: sections[base.kind] ?? '',
    };
  };

  const items: ItemDef[] = cat.map((c) => make({
    key: c.key, name: c.name, source: c.source, price: c.price, kind: c.kind, group: c.group, note: c.note, rules: c.rules, forSale: true,
  }));
  // Drops: never for sale, but a crew can find them (9.7).
  for (const w of raw.weapons.filter((w) => plain(w.Source).toLowerCase() === 'drop')) {
    items.push(make({ key: keyOf(w.Weapon), name: plain(w.Weapon).replace(/\s*\(.*\)/, ''), source: 'drop', price: null, kind: 'weapon', group: 'Drops', note: null, rules: w, forSale: false }));
  }
  for (const d of raw.drop_items) {
    items.push(make({ key: keyOf(d['Drop item']), name: plain(d['Drop item']).replace(/\s*\(.*\)/, ''), source: 'drop', price: null, kind: 'drop', group: 'Drops', note: null, rules: d, forSale: false }));
  }
  return items;
}

export function validateOutcomes(json: unknown): Outcomes {
  const res = outcomesSchema.safeParse(json);
  if (!res.success) throw new Error(`data/manual/outcomes.json does not match its schema: ${res.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  return res.data;
}

export function buildRules(raw: RawData = rawData, crewJson: unknown = crewRulesJson, outcomesData: unknown = outcomesJson): Rules {
  validateRaw(raw);
  const crew = validateCrewRules(crewJson);
  const outcomes = validateOutcomes(outcomesData);
  const sections = crew.sections.value;
  const cat = raw.catalog as CatalogItem[];
  const items = buildItems(crew, raw, cat);
  const byId = new Map(items.map((i) => [i.id, i]));
  const facs = raw.factions as Faction[];

  const chassis: Record<string, ChassisDef> = {};
  for (const f of facs) for (const t of f.types) {
    const m = plain(t.trait).match(/Move (\d+), Hands (\d+)/);
    if (m) chassis[t.name] = { move: +m[1], hands: +m[2] };
  }

  const rites = Array.from(new Set(items.filter((i) => i.rite).map((i) => i.rite as string)));

  const advanceDefs: AdvanceDef[] = [];
  for (const [list, rows] of Object.entries(raw.advances)) {
    for (const r of rows as Row[]) {
      const name = plain(r.Advance);
      const needs = name.match(/\(needs (.+?)\)/)?.[1] ?? null;
      const clean = name.replace(/\s*\(needs .+?\)/, '');
      const many = clean.match(/^(.*?)\b((?:\w+, )+\w+ or \w+)$/);
      if (many) {
        for (const opt of many[2].split(/, | or /)) advanceDefs.push({ list, name: `${many[1]}${opt}`.trim(), rule: r.Rule, needs });
      } else advanceDefs.push({ list, name: clean, rule: r.Rule, needs });
    }
  }

  const named = (rows: Row[], key: string, textKey: string, table: string): NamedRule[] =>
    rows.map((r) => { const nt = nameAndTitle(r[key]); return { name: nt.name, title: nt.title, text: r[textKey], table }; });

  const legends: LegendDef[] = [];
  const deedList: Rules['deeds'] = [];
  for (const [tier, rows] of Object.entries(raw.deeds)) {
    for (const r of rows as Row[]) {
      const d = nameAndTitle(r.Deed);
      deedList.push({ id: r['#'], tier, name: d.name, text: d.rest, legend: r.Legend ?? null });
      if (r.Legend) { const l = nameAndTitle(r.Legend); legends.push({ name: l.name, title: l.title, text: l.rest, from: `${r['#']} ${d.name}` }); }
    }
  }
  for (const r of raw.rumours) {
    const l = nameAndTitle(r.Legend);
    legends.push({ name: l.name, title: l.title, text: l.rest, from: `Rumour: ${nameAndTitle(r.Rumour).name}` });
  }

  const ladder = crew.experience.ladder;
  const thresholds = (count: number) => {
    const out = ladder.value.slice(0, count);
    let gap = ladder.gapAfter.value;
    while (out.length < count) { out.push((out[out.length - 1] ?? 0) + gap); gap += ladder.gapAfter.growth; }
    return out;
  };

  return {
    version: raw._meta.rulebookVersion,
    meta: raw._meta,
    data: raw as unknown as Data,
    crew,
    outcomes,
    factions: facs,
    faction: (n) => facs.find((f) => f.name === n),
    factionRules: (n) => crew.factions[n],
    species: raw.species.map((s) => ({ name: plain(s.Species), moveText: s.Move, move: /^\d/.test(s.Move) ? parseInt(s.Move, 10) : null, trait: s['Signature trait'] })),
    items,
    shopItems: items.filter((i) => i.forSale),
    item: (id) => byId.get(id),
    recruitPrices: parseRecruits(raw.recruits),
    chassis,
    rites,
    advanceDefs,
    advanceLists: Object.keys(raw.advances),
    captainTraits: raw.captain_traits.map((c) => ({ name: plain(c['Captain trait']), rule: c.Rule })),
    injuries: [...named(raw.injuries_light, 'Injury (title)', 'What it does', 'Light'), ...named(raw.injuries_heavy, 'Injury (title)', 'What it does', 'Heavy')],
    glitches: named(raw.glitches, 'Glitch (title)', 'What it does', 'Glitch'),
    silly: Object.entries(raw.silly_traits).flatMap(([table, rows]) => named(rows as Row[], 'Trait (nickname)', 'Rule', table)),
    legends,
    deeds: deedList,
    tags: raw.tags.map((t) => ({ name: plain(t.Tag), gained: t['Gained when'], text: t['What it does'] })),
    contacts: raw.contacts.map((c) => ({ name: plain(c.Contact), text: c['Use them to'] })),
    weaponTraits: Object.fromEntries(raw.weapon_traits.map((t) => [plain(t.Trait), t.Effect])),
    powers: raw.psionic_powers.map((p) => ({ name: plain(p.Power), number: p.Number, text: p.Effect })),
    section: (kind) => sections[kind] ?? '',
    thresholds,
  };
}

let cached: Rules | null = null;
export function getRules(): Rules {
  if (!cached) cached = buildRules();
  return cached;
}
export type { Eff } from './schema';
