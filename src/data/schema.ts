// Zod schemas for every file in data/. A rulebook change that breaks the
// shape of the data fails here, loudly, at load time and in the tests.
import { z } from 'zod';

const str = z.string();
const row = (...keys: string[]) => z.object(Object.fromEntries(keys.map((k) => [k, str]))).passthrough();
const rows = (...keys: string[]) => z.array(row(...keys)).min(1);
const listsOf = (...keys: string[]) => z.record(rows(...keys));

export const sourceSchema = z.enum(['copy', 'old stock']);

export const catalogItemSchema = z.object({
  name: str,
  group: str,
  source: sourceSchema,
  price: z.number().int().nonnegative(),
  note: str.nullable(),
  key: str,
  kind: z.enum(['weapon', 'armour', 'frame', 'grenade', 'device', 'medical kit', 'relic', 'robo-arm', 'prosthetic', 'shield', 'force field']),
  rules: z.record(z.unknown()),
});

export const factionSchema = z.object({
  section: str,
  name: str,
  rules: z.array(z.object({ n: z.number().int(), name: str, text: str })).length(4),
  subfactions: z.array(z.object({ name: str, replaces: z.number().int().min(1).max(4), rule: str })).min(1),
  types: z.array(z.object({ name: str, label: str, trait: str })),
  ownTaskTable: rows('d6', 'Result'),
  voice: str,
  startingKit: str,
  specials: str,
  captiveFate: str,
  ownTask: str,
  noWords: str.optional(),
});

export const metaSchema = z.object({
  rulebookVersion: str,
  files: z.record(z.number()),
  unlinkedShopItems: z.array(str),
});

export const generatedSchemas = {
  _meta: metaSchema,
  species: rows('Species', 'Move', 'Signature trait'),
  slots: rows('Slot', 'What goes in it', 'Size'),
  weapon_traits: rows('Trait', 'Effect'),
  weapons: rows('Weapon', 'Source', 'Hands', 'Range', 'Traits'),
  armour: rows('Armour', 'Save dice', 'Other rule'),
  armour_by_source: rows('Source', 'Armour rule'),
  frames: rows('Frame', 'Basic (no Energy)', 'Boosted (1 Energy)'),
  robo_arms: rows('Source', 'Basic'),
  grenades: rows('Grenade', 'Basic'),
  devices: rows('Device', 'Basic'),
  medical_kits: rows('Tier', 'Kit', 'Effect'),
  drop_items: rows('Drop item', 'Slot', 'What it does'),
  relics: rows('Relic (rite)', 'Slot', 'Basic', 'Boosted (1 Energy)'),
  psionic_powers: rows('Power', 'Number', 'Effect'),
  captain_traits: rows('Captain trait', 'Rule'),
  shop: z.array(catalogItemSchema.omit({ key: true, kind: true, rules: true })).min(1),
  recruits: rows('recruit', 'price'),
  factions: z.array(factionSchema).min(1),
  research_studies: z.object({ field: rows('d6', 'Field study'), lab: rows('d6', 'Lab study') }),
  xp_ladder: rows('Advance', 'Total Experience'),
  advances: listsOf('Advance', 'Rule'),
  injuries_light: rows('d6', 'Injury (title)', 'What it does'),
  injuries_heavy: rows('d6', 'Injury (title)', 'What it does'),
  prosthetics: rows('Injury', 'Replacement', 'Effect'),
  glitches: rows('d6', 'Glitch (title)', 'What it does'),
  recovery_words: rows('Recovery word', 'Effect'),
  silly_traits: listsOf('d6', 'Trait (nickname)', 'Rule'),
  deeds: listsOf('#', 'Deed'),
  rumours: rows('Rumour', 'Deed', 'Legend'),
  tags: rows('Tag', 'Gained when', 'What it does'),
  contacts: rows('Contact', 'Use them to'),
  tasks: rows('Task', 'Test', 'Success'),
  glossary: rows('Term', 'Meaning', 'See'),
  catalog: z.array(catalogItemSchema).min(1),
  difficulties: rows('Difficulty', 'Target'),
  severity: rows('Margin', 'Severity'),
  states: rows('State', 'What it does', 'When it ends'),
  actions: rows('Action', 'What it does'),
  consequences: listsOf('d6', 'Result'),
  lasting_conditions: rows('Condition', 'Bot name', 'What it does'),
  clashes: listsOf('d66', 'Result'),
  voices: z.record(z.object({ intro: str, rows: rows('d6', 'Result', 'Effect', 'Mark') })),
  drop_table: rows('d66', 'What came out'),
  generic_xp: rows('Deed', 'XP'),
  deed_tiers: z.record(z.object({ tier: str, xp: z.number() })),
  word_audiences: rows('Audience', 'What it is', 'Fulfilled', 'Failed'),
  injury_tables: listsOf('d66', 'Result'),
  bot_words: rows('Organic result', 'Bot result'),
  story_rows: rows('Row', 'Choose it when the crew...'),
  story_events: listsOf('d6', 'Event', 'Accept', 'Pay', 'Twist'),
  task_tables: listsOf('2d6', 'Result'),
  finds: rows('d6', 'Find'),
  league_points: rows('What', 'Points'),
  bot_states: rows('State', 'When', 'What it does'),
};
export type Effect = z.infer<typeof effectSchema>;
export type TaskPay = z.infer<typeof taskPaySchema>;

// ---------- crew-rules.json (hand-kept) ----------
const sourced = <T extends z.ZodTypeAny>(value: T) => z.object({ value, source: str }).passthrough();
const num = sourced(z.number());

const kitEntry = z.object({
  item: str.optional(),
  source: sourceSchema.optional(),
  count: z.number().int().positive().optional(),
  who: str.optional(),
  assign: z.enum(['captain', 'otherRookie', 'eachRookie']).optional(),
  choice: str.optional(),
  pick: z.object({ kind: str, source: sourceSchema, maxPrice: z.number() }).optional(),
});

export const effectSchema = z.object({
  id: str,
  rule: z.number().int().optional(),
  subfaction: str.optional(),
  type: str.optional(),
  when: z.enum(['setup', 'roundStart', 'pod', 'putDown', 'voice', 'voiceGood', 'afterBattle', 'captive', 'break', 'legend']),
  kind: z.enum(['reminder', 'xpEach', 'partsPer', 'partsIf', 'rating', 'nameEnemy', 'payment', 'research', 'sellDrop', 'cancelFighter', 'spinOffLegend', 'rollOwnTaskTable', 'captiveXp']),
  rounds: z.array(z.number()).optional(),
  roll: z.enum(['d6', '2d6', 'd66']).optional(),
  amount: z.number().optional(),
  ask: str.optional(),
  per: z.enum(['putDowns', 'crushingPutDowns', 'count']).optional(),
  who: z.enum(['participants', 'standingShook', 'anyFighter', 'bots']).optional(),
  condition: z.enum(['newWorld', 'notHeldField']).optional(),
  factionPay: z.boolean().optional(),
  high: z.object({ value: z.number(), xp: z.number().optional(), parts: z.number().optional() }).optional(),
  low: z.object({ value: z.number(), xp: z.number().optional(), parts: z.number().optional() }).optional(),
  eligibleTypes: z.array(str).optional(),
  state: str.optional(),
  xpBelow: z.number().optional(),
  prefix: str.optional(),
});

export const taskPaySchema = z.object({
  task: str,
  rule: z.number().optional(),
  subfaction: str.optional(),
  captainTrait: str.optional(),
  tag: str.optional(),
  parts: z.number().optional(),
  setParts: z.number().optional(),
  xpSuccess: z.number().optional(),
  xpFailure: z.number().optional(),
  source: str.optional(),
});

const priceRule = z.object({
  rule: z.number().int().optional(),
  subfaction: str.optional(),
  replacedBySubfaction: str.optional(),
  kind: z.enum(['copyDiscount', 'recruitPrice', 'chassisDiscount', 'noSellerRoll']),
  amount: z.number().optional(),
  min: z.number().optional(),
  recruit: str.optional(),
  price: z.number().optional(),
  itemKind: str.optional(),
  source: sourceSchema.optional(),
  effect: str,
});

export const factionRulesSchema = z.object({
  startingKit: z.array(kitEntry),
  priceRules: z.array(priceRule).optional(),
  specials: z.object({ gift: z.number().nullable(), rites: z.number().nullable(), bots: z.boolean(), volunteer: z.number().optional() }),
  types: z.boolean(),
  typeGrants: z.record(z.object({ carriesRelics: z.boolean().optional(), note: str.optional(), rites: z.boolean().optional(), ritesKnown: z.number().optional(), gift: z.boolean().optional(), speciesOnly: z.array(str).optional() })).optional(),
  ritesKnownByAnyPriest: z.object({ value: z.number(), rule: z.number() }).optional(),
  credit: z.object({ value: z.number(), rule: z.number(), note: str.optional() }).optional(),
  fixedRookies: z.array(str).optional(),
  captainType: str.optional(),
  typeSpecies: z.record(str).optional(),
  rookiesMayBeBots: sourced(z.boolean()).optional(),
  noWords: z.boolean().optional(),
  wordKind: sourced(str).optional(),
  effects: z.array(effectSchema).optional(),
  taskPay: z.array(taskPaySchema).optional(),
  typeRules: z.record(z.object({ injuryTable: z.enum(['gentle', 'harsh']).optional(), putDownXpTo: str.optional(), noTitle: z.boolean().optional(), source: str })).optional(),
});

const slotRule = z.object({
  slot: z.enum(['hands', 'body', 'frame', 'belt', 'fitted']).optional(),
  hands: z.number().optional(),
  handsFrom: str.optional(),
  slotFrom: str.optional(),
  belt: z.number().optional(),
  handsBonus: z.number().optional(),
});

export const crewRulesSchema = z.object({
  creation: z.object({
    startingParts: num,
    startingRookies: num,
    rookieBasePrice: num,
    captainTraitsAtStart: num,
    oldStockSeller: sourced(z.number()).extend({ modifiers: z.array(z.object({ captainTrait: str, value: z.number(), source: str })) }),
    dropsForSale: sourced(z.boolean()),
  }).passthrough(),
  limits: z.object({
    maxFighters: num,
    maxGifted: num,
    giftSpecies: sourced(z.array(str)),
    botsOnlyFor: sourced(str),
    ratingRange: sourced(z.tuple([z.number(), z.number()])),
    traitBudget: num,
    maxLastingInjuries: num,
    oneSillyTrait: sourced(z.boolean()),
    botForbiddenRating: sourced(str),
    ratingNames: sourced(z.array(str).length(5)),
    playableSpecies: sourced(z.array(str)),
    botSpecies: sourced(str),
    maxTags: num,
    maxContacts: num,
    maxCrewRumours: num,
  }),
  gear: z.object({
    handsSets: num,
    handsPerSet: num,
    handsInUse: sourced(z.object({ default: z.number(), roboArmBonus: z.number() }).catchall(z.number())),
    bodySlots: num,
    frameSlots: num,
    beltSlots: num,
    grenadesPerBeltSlot: num,
    heavyArmourWithFrame: sourced(z.boolean()),
    civilianFrameArmour: sourced(z.array(str)),
    battery: sourced(z.object({ default: z.number(), militaryFrame: z.number() })),
    kindSlots: sourced(z.record(slotRule)),
    frameKeys: sourced(z.object({ military: str, civilian: str })),
    heavyArmourKey: sourced(str),
    mountWeapons: sourced(z.object({ hands: str, alsoTwoHanded: z.boolean() })),
    moveModifiers: sourced(z.record(z.number())),
    saveDice: sourced(z.record(z.number())),
    prosthetics: sourced(z.record(str)),
    injuryEffects: sourced(z.record(z.object({
      hands: z.number().optional(),
      moveHalved: z.boolean().optional(),
      fixedBy: z.record(z.object({ move: z.number() })).optional(),
    }))),
    minHands: num,
    restrictedItems: sourced(z.array(z.object({ key: str, factions: z.array(str) }))),
  }).passthrough(),
  experience: z.object({
    ladder: sourced(z.array(z.number())).extend({ gapAfter: z.object({ value: z.number(), growth: z.number() }) }),
    traitListNeedsRating: num,
    noTwoRatingAdvancesInARow: sourced(z.boolean()),
    aceFromAdvance: num,
    aceFromAdvanceNumber: num,
    aceTo: num,
    ratingAdvanceMax: num,
    botsNeverRaiseNerve: sourced(z.boolean()),
    commonList: sourced(str),
    captainListAsAdvance: sourced(z.boolean()),
    ritesAdvance: sourced(str),
  }),
  underdogs: z.object({
    strength: sourced(str),
    threshold: sourced(z.array(z.number())).extend({ xp: z.array(z.number()) }),
  }),
  campaign: z.object({
    airTax: num.extend({ exempt: z.array(str) }),
    rechargePerEnergy: num,
    removeTag: num,
    sellFraction: num,
    fenceContact: sourced(str),
    statuses: sourced(z.array(str)),
    fates: sourced(z.array(str)),
  }),
  sections: z.object({ value: z.record(str) }).passthrough(),
  dice: z.object({ netEdgeCap: num, badKeptTotal: num }),
  factionPayCap: num,
  taskPay: sourced(z.array(taskPaySchema)),
  battle: z.object({
    rounds: num.extend({ extraRoundOn: z.number(), max: z.number() }),
    pod: num.extend({ fallsOn: z.number() }),
    conditionsToDown: num,
    cancellingStates: sourced(z.array(str)),
    endsOnOwnActivation: sourced(str),
    positions: sourced(z.array(z.object({ name: str, onTable: z.boolean().optional(), cameHome: z.boolean().optional(), injury: z.enum(['gentle', 'harsh', 'heldField', 'harshTwice']).optional(), down: z.boolean().optional(), captured: z.boolean().optional() }))),
    wordsPerSide: num.extend({ extraFrom: z.object({ captainTrait: str, tag: str }) }),
    putDownXpMax: num,
    boastXpBonus: num,
    boastAudience: sourced(str),
    legendTiers: sourced(z.array(str)),
    sillyTables: sourced(z.record(str)),
  }),
  afterBattle: z.object({
    injuryTables: sourced(z.object({ gentle: str, harsh: str })),
    deadResult: sourced(str),
    botDeadFate: sourced(str),
    takenFate: sourced(str),
    genericXp: sourced(z.object({ cameHome: str, putDown: str, didJob: str })),
    leaguePoints: sourced(z.record(str)),
    taskBlockedStatuses: sourced(z.array(str)),
    taskTableDie: sourced(str).extend({ ownTask: str }),
    resetStatusesAtBreak: sourced(z.boolean()),
    storyRowHints: sourced(z.record(z.enum(['heldField', 'notHeldField', 'ran', 'lostSomeone', 'captive', 'legend']))),
  }),
  factions: z.record(factionRulesSchema),
}).passthrough();

export type CrewRules = z.infer<typeof crewRulesSchema>;
export type FactionRules = z.infer<typeof factionRulesSchema>;
export type PriceRule = z.infer<typeof priceRule>;
export type KitEntry = z.infer<typeof kitEntry>;
export type CatalogItem = z.infer<typeof catalogItemSchema>;
export type Faction = z.infer<typeof factionSchema>;
export type Row = Record<string, string>;
