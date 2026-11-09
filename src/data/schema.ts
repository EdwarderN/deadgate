// Zod schemas for every file in data/. A rulebook change that breaks the
// shape of the data fails here, loudly, at load time and in the tests.
import { z } from 'zod';

const str = z.string();
const row = (...keys: string[]) => z.object(Object.fromEntries(keys.map((k) => [k, str]))).passthrough();
const rows = (...keys: string[]) => z.array(row(...keys)).min(1);
const listsOf = (...keys: string[]) => z.record(z.string(), rows(...keys));

export const sourceSchema = z.enum(['copy', 'old stock']);

export const catalogItemSchema = z.object({
  name: str,
  group: str,
  source: sourceSchema,
  price: z.number().int().nonnegative(),
  note: str.nullable(),
  key: str,
  kind: z.enum(['weapon', 'armour', 'frame', 'grenade', 'device', 'medical kit', 'relic', 'robo-arm', 'prosthetic', 'shield', 'force field']),
  rules: z.record(z.string(), z.unknown()),
});

export const factionSchema = z.object({
  section: str,
  name: str,
  rules: z.array(z.object({ n: z.number().int(), name: str, text: str, fixed: z.boolean().optional() })).length(4),
  subfactions: z.array(z.object({ name: str, rule: str })).min(1),
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
  files: z.record(z.string(), z.number()),
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
  voices: z.record(z.string(), z.object({ intro: str, rows: rows('d6', 'Result', 'Effect', 'Mark') })),
  drop_table: rows('d66', 'What came out'),
  generic_xp: rows('Deed', 'XP'),
  deed_tiers: z.record(z.string(), z.object({ tier: str, xp: z.number() })),
  word_audiences: rows('Audience', 'What it is', 'Fulfilled', 'Failed'),
  injury_tables: listsOf('d66', 'Result'),
  bot_words: rows('Organic result', 'Bot result'),
  story_rows: rows('Row', 'Choose it when the crew...'),
  story_events: listsOf('d6', 'Event', 'Accept', 'Pay', 'Twist'),
  task_tables: listsOf('2d6', 'Result'),
  finds: rows('d6', 'Find'),
  league_points: rows('What', 'Points'),
  bot_states: rows('State', 'When', 'What it does'),
  gear_failure: listsOf('d6', 'Result'),
  grenade_scatter: rows('Direction die', 'The grenade lands'),
  grenade_distance: rows("Thrower's Shoot"),
  prompt_targets: rows('Target', 'Number', 'Effects (choose one)'),
  melee_results: rows('Result', 'What happens'),
  melee_dice: rows('Source', 'Who gets it'),
  shot_results: rows('Shot total', 'Result'),
  shooting_helps: rows('Helps the shooter', 'Dice'),
  shooting_protects: rows('Protects the target (the shooter loses dice)', 'Dice'),
  reactions: rows('Reaction', 'What it does', 'The price'),
  force_field_saves: rows('What hit the wearer', 'What the field does'),
  terrain_traits: rows('Trait', 'What it does'),
  doors: rows('Condition', 'Token'),
  deployment: rows('d6', 'Deployment', "Each side's zone"),
  world_table: rows('d66', 'World', 'Ground'),
  npm: rows('Model', 'Move', 'Fight', 'Shoot', 'Save', 'Tough', 'At the end of each round'),
  worlds: z.array(z.object({
    section: str, name: str, ground: str, alwaysOn: str, terrain: str,
    events: rows('d6', 'Event'),
    battles: z.array(z.object({ d6: str, name: str })).length(3),
    scenarios: z.array(z.object({ name: str, title: str, lore: str, sections: z.array(z.object({ label: str, text: str })).min(4) })).length(3),
  })).min(1),
  final: z.array(z.object({ label: str, text: str })).min(1),
  gift_rules: z.array(z.object({ label: str, text: str })).min(1),
  tag_opposites: z.array(z.tuple([str, str])).min(1),
  title_rules: z.array(z.object({ title: z.string(), text: str, prefixed: z.boolean().optional() })).min(1),
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
  when: z.enum(['setup', 'roundStart', 'pod', 'putDown', 'allyDown', 'gearFail', 'voice', 'voiceGood', 'afterBattle', 'captive', 'break', 'legend', 'breaking']),
  kind: z.enum(['reminder', 'xpEach', 'partsPer', 'partsIf', 'rating', 'nameEnemy', 'payment', 'research', 'sellDrop', 'cancelFighter', 'spinOffLegend', 'rollOwnTaskTable', 'captiveXp', 'breakingDice', 'breakingThreshold']),
  rounds: z.array(z.number()).optional(),
  roll: z.enum(['d6', '2d6', 'd66']).optional(),
  amount: z.number().optional(),
  ask: str.optional(),
  per: z.enum(['putDowns', 'spectacular', 'count']).optional(),
  who: z.enum(['participants', 'standingShook', 'anyFighter', 'bots']).optional(),
  condition: z.enum(['newWorld', 'notHeldField']).optional(),
  factionPay: z.boolean().optional(),
  high: z.object({ value: z.number(), xp: z.number().optional(), parts: z.number().optional() }).optional(),
  low: z.object({ value: z.number(), xp: z.number().optional(), parts: z.number().optional() }).optional(),
  eligibleTypes: z.array(str).optional(),
  state: str.optional(),
  xpBelow: z.number().optional(),
  prefix: str.optional(),
  prefixAfter: str.optional(),
  captain: z.enum(['standing', 'down']).optional(),
  fraction: z.number().optional(),
  /** breaking dice that depend on the crew's parts (Pay or walk, 12.5) */
  partsAtLeast: z.number().optional(),
  partsBelow: z.number().optional(),
  /** a captive fate that also gives the crew a lead (12.4) */
  lead: z.boolean().optional(),
  /** the glossary term the effect counts (Spectacular, 6.2) */
  term: str.optional(),
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
  typeGrants: z.record(z.string(), z.object({ carries: z.object({ name: str, hands: z.number(), set: z.enum(['set1', 'set2']), source: str }).optional(), carriesRelics: z.boolean().optional(), note: str.optional(), rites: z.boolean().optional(), ritesKnown: z.number().optional(), gift: z.boolean().optional(), speciesOnly: z.array(str).optional() })).optional(),
  ritesKnownByAnyPriest: z.object({ value: z.number(), rule: z.number() }).optional(),
  credit: z.object({ value: z.number(), rule: z.number(), note: str.optional() }).optional(),
  beltSlots: z.object({ value: z.number(), rule: z.number(), source: str }).optional(),
  fixedRookies: z.array(str).optional(),
  captainType: str.optional(),
  typeSpecies: z.record(z.string(), str).optional(),
  rookiesMayBeBots: sourced(z.boolean()).optional(),
  noWords: z.boolean().optional(),
  wordKind: sourced(str).optional(),
  effects: z.array(effectSchema).optional(),
  taskPay: z.array(taskPaySchema).optional(),
  typeRules: z.record(z.string(), z.object({ injuryTable: z.enum(['gentle', 'harsh']).optional(), putDownXpTo: str.optional(), noTitle: z.boolean().optional(), builtIn: z.object({ kind: str, source: sourceSchema, maxPrice: z.number() }).optional(), note: str.optional(), source: str })).optional(),
  typeLimits: sourced(z.record(z.string(), z.number())).optional(),
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
    maxRivals: num.optional(),
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
    kindSlots: sourced(z.record(z.string(), slotRule)),
    frameKeys: sourced(z.object({ military: str, civilian: str })),
    heavyArmourKey: sourced(str),
    mountWeapons: sourced(z.object({ hands: str, alsoTwoHanded: z.boolean() })),
    moveModifiers: sourced(z.record(z.string(), z.number())),
    saveDice: sourced(z.record(z.string(), z.number())),
    prosthetics: sourced(z.record(z.string(), str)),
    injuryEffects: sourced(z.record(z.string(), z.object({
      hands: z.number().optional(),
      moveHalved: z.boolean().optional(),
      fixedBy: z.record(z.string(), z.object({ move: z.number() })).optional(),
    }))),
    minHands: num,
    restrictedItems: sourced(z.array(z.object({ key: str, factions: z.array(str) }))),
    singleUse: sourced(z.array(str)).extend({ uses: z.number() }),
    grenadeDistance: sourced(z.record(z.string(), z.number())).extend({ copyExtra: z.number(), blindExtra: z.number() }),
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
    doctor: sourced(str).optional(),
    ransom: sourced(z.object({ min: z.number(), perXp: z.number(), max: z.number() })).optional(),
    spendEffects: sourced(z.object({ rechargeMultiplier: z.number(), hireExtra: z.number() })).optional(),
    loseNoteFallback: num.optional(),
    fates: sourced(z.array(str)),
    relicLeadKind: sourced(str),
    contactUses: sourced(z.record(z.string(), z.object({ task: str.optional(), target: z.number().optional(), laidUpToSore: z.boolean().optional(), prostheticFraction: z.number().optional(), findsOnFailure: z.number().optional(), hireDiscount: z.number().optional(), airTaxFraction: z.number().optional() }))),
    sillyEffects: sourced(z.record(z.string(), z.object({ noAdvances: z.boolean().optional(), tierUp: z.boolean().optional() }))),
    season: sourced(z.tuple([z.number(), z.number()])),
  }),
  final: z.object({ words: num, spotlightFrom: num, title: sourced(str), deployment: sourced(str) }),
  sections: z.object({ value: z.record(z.string(), str) }).passthrough(),
  dice: z.object({ netEdgeCap: num, badKeptTotal: num }),
  factionPayCap: num,
  taskPay: sourced(z.array(taskPaySchema)),
  battle: z.object({
    rounds: num.extend({ extraRoundOn: z.number(), max: z.number() }),
    pod: num.extend({ fallsOn: z.number() }),
    conditionsToDown: num,
    cancellingStates: sourced(z.array(str)),
    endsOnOwnActivation: sourced(str),
    positions: sourced(z.array(z.object({ name: str, botOnly: z.boolean().optional(), notBot: z.boolean().optional(), corePulled: z.boolean().optional(), onTable: z.boolean().optional(), cameHome: z.boolean().optional(), injury: z.enum(['gentle', 'harsh', 'heldField', 'harshTwice']).optional(), down: z.boolean().optional(), captured: z.boolean().optional() }))),
    wordsPerSide: num.extend({ extraFrom: z.object({ captainTrait: str, tag: str }) }),
    putDownXpMax: num,
    boastXpBonus: num,
    boastAudience: sourced(str),
    legendTiers: sourced(z.array(str)),
    sillyTables: sourced(z.record(z.string(), str)),
    breaking: sourced(z.number()).extend({ roundUp: z.boolean(), rating: str, target: z.number(), captainTraits: z.record(z.string(), z.number()) }),
    worldEventRound: num,
    tableSize: num.extend({ small: str, large: str }),
    madness: sourced(str).extend({ frenzied: str, cracked: str, trait: str, title: str }),
    rumourWord: num.extend({ tier: str, audience: str, silly: str, past: str }),
    wagerStakes: sourced(z.record(z.string(), z.number())).extend({ audience: str, noTakerTag: str, alwaysTakerTag: str.optional() }),
  }),
  afterBattle: z.object({
    injuryTables: sourced(z.object({ gentle: str, harsh: str })),
    deadResult: sourced(str),
    botDeadFate: sourced(str),
    takenFate: sourced(str),
    genericXp: sourced(z.object({ cameHome: str, putDown: str, didJob: str })),
    leaguePoints: sourced(z.record(z.string(), str)),
    taskBlockedStatuses: sourced(z.array(str)),
    taskTableDie: sourced(str).extend({ ownTask: str }),
    resetStatusesAtBreak: sourced(z.boolean()),
    botCore: num,
    twistTest: sourced(str),
    taskPayDoubleIsPrinted: sourced(z.boolean()),
    ransomTags: sourced(z.array(str)).optional(),
    tagDice: sourced(z.array(z.object({ tag: str, on: z.enum(['twist', 'task']), task: str.optional(), dice: z.number() }))).optional(),
    tagStoryRolls: sourced(z.array(z.object({ tag: str, row: str, rolls: z.number() }))).optional(),
    tagGain: sourced(z.record(z.string(), z.array(z.lazy(() => effSchema)))).optional(),
    rivalXp: num.optional(),
    autoTags: sourced(z.array(z.object({ tag: str, when: z.enum(['fulfilledWords', 'failedWords', 'captiveFates', 'lowestRansoms']), count: z.number(), audience: str.optional(), tiers: z.array(str).optional() }))).optional(),
    captorRolls: sourced(z.boolean()).optional(),
    storyRowHints: sourced(z.record(z.string(), z.enum(['heldField', 'notHeldField', 'ran', 'lostSomeone', 'captive', 'legend', 'always']))),
  }),
  factions: z.record(z.string(), factionRulesSchema),
}).passthrough();

export type CrewRules = z.infer<typeof crewRulesSchema>;
export type FactionRules = z.infer<typeof factionRulesSchema>;
export type PriceRule = z.infer<typeof priceRule>;
export type KitEntry = z.infer<typeof kitEntry>;
export type CatalogItem = z.infer<typeof catalogItemSchema>;
export type Faction = z.infer<typeof factionSchema>;
export type Row = Record<string, string>;

// ---------- outcomes.json (hand-kept): what each table row does ----------
export type Who = string;
export interface Eff {
  parts?: number; ifDebt?: number; belowZero?: boolean; crossContact?: boolean;
  ward?: string; loseContact?: boolean; loseLead?: boolean; crossLead?: boolean; crossRival?: boolean;
  spend?: { kind: 'rechargeDouble' | 'purchase' | 'hire' | 'sale'; amount?: number };
  xp?: number; who?: Who;
  status?: string; next?: string; tag?: string; contact?: string; rival?: boolean; lead?: boolean; silly?: string;
  item?: { key?: string; source?: 'copy' | 'old stock' | 'drop'; kinds?: string[]; maxPrice?: number; any?: boolean; label?: string; fit?: boolean };
  loseItem?: { who?: Who; kinds?: string[]; source?: string; key?: string; count?: number; label?: string };
  sellItem?: { fraction: number; who?: Who; kinds?: string[]; source?: string };
  buyItem?: { source?: string; kinds?: string[]; fraction: number };
  hire?: { discount?: number; free?: boolean; past?: string; note?: string };
  relicLead?: { noRoll: boolean }; sellerFound?: boolean; noTasks?: boolean; noTask?: Who; gift?: Who; healInjury?: Who; prosthetic?: Who;
  allLaidUpToSore?: boolean; injury?: string; injuryRoll?: string; times?: number; reroll?: number; dead?: boolean; leave?: Who; title?: string;
  finds?: number; keep?: number; drop?: boolean;
  d6?: { range: string; effects: Eff[] }[];
  test?: { rating: string; target: number }; success?: Eff[]; failure?: Eff[];
  choice?: { label: string; effects: Eff[] }[];
  taskPay?: number | 'failure'; noFinds?: boolean; retest?: boolean; swapAdvance?: string; note?: string;
  recharge?: number | 'full';
  /** one result if the crew's parts are below 0, another if not */
  debt?: { yes: Eff[]; no: Eff[] };
}
export const effSchema: z.ZodType<Eff> = z.lazy(() => z.object({
  parts: z.number().optional(), ifDebt: z.number().optional(), belowZero: z.boolean().optional(), crossContact: z.boolean().optional(),
  ward: str.optional(), loseContact: z.boolean().optional(), loseLead: z.boolean().optional(), crossLead: z.boolean().optional(), crossRival: z.boolean().optional(),
  spend: z.object({ kind: z.enum(['rechargeDouble', 'purchase', 'hire', 'sale']), amount: z.number().optional() }).optional(),
  xp: z.number().optional(), who: str.optional(),
  status: str.optional(), next: str.optional(), tag: str.optional(), contact: str.optional(), rival: z.boolean().optional(), lead: z.boolean().optional(), silly: str.optional(),
  item: z.object({ key: str.optional(), source: z.enum(['copy', 'old stock', 'drop']).optional(), kinds: z.array(str).optional(), maxPrice: z.number().optional(), any: z.boolean().optional(), label: str.optional(), fit: z.boolean().optional() }).optional(),
  loseItem: z.object({ who: str.optional(), kinds: z.array(str).optional(), source: str.optional(), key: str.optional(), count: z.number().optional(), label: str.optional() }).optional(),
  sellItem: z.object({ fraction: z.number(), who: str.optional(), kinds: z.array(str).optional(), source: str.optional() }).optional(),
  buyItem: z.object({ source: str.optional(), kinds: z.array(str).optional(), fraction: z.number() }).optional(),
  hire: z.object({ discount: z.number().optional(), free: z.boolean().optional(), past: str.optional(), note: str.optional() }).optional(),
  relicLead: z.object({ noRoll: z.boolean() }).optional(), sellerFound: z.boolean().optional(), noTasks: z.boolean().optional(), noTask: str.optional(),
  gift: str.optional(), healInjury: str.optional(), prosthetic: str.optional(), allLaidUpToSore: z.boolean().optional(),
  injury: str.optional(), injuryRoll: str.optional(), times: z.number().optional(), reroll: z.number().optional(), dead: z.boolean().optional(), leave: str.optional(), title: str.optional(),
  finds: z.number().optional(), keep: z.number().optional(), drop: z.boolean().optional(),
  d6: z.array(z.object({ range: str, effects: z.array(effSchema) })).optional(),
  test: z.object({ rating: str, target: z.number() }).optional(), success: z.array(effSchema).optional(), failure: z.array(effSchema).optional(),
  choice: z.array(z.object({ label: str, effects: z.array(effSchema) })).optional(),
  taskPay: z.union([z.number(), z.literal('failure')]).optional(), noFinds: z.boolean().optional(), retest: z.boolean().optional(), swapAdvance: str.optional(), note: str.optional(),
  recharge: z.union([z.number(), z.literal('full')]).optional(),
  debt: z.object({ yes: z.array(effSchema), no: z.array(effSchema) }).optional(),
}).strict());
const effs = z.array(effSchema);
export const outcomesSchema = z.object({
  _about: str, source: str,
  storyEvents: z.record(z.string(), z.record(z.string(), z.object({ accept: effs, pay: effs.optional(), twist: z.object({ rating: str, success: effs, failure: effs }).optional() }))),
  injuryTables: z.record(z.string(), z.record(z.string(), effs)),
  taskBase: z.record(z.string(), z.object({ success: effs, failure: effs, needs: z.enum(['patient', 'teacher']).optional() })),
  taskTables: z.record(z.string(), z.record(z.string(), effs)),
  ownTasks: z.record(z.string(), z.object({ success: effs, failure: effs, table: z.record(z.string(), effs) })),
  finds: z.record(z.string(), effs),
  dropTable: z.record(z.string(), effs),
  prize: effs,
  finalPrize: effs,
});
export type Outcomes = z.infer<typeof outcomesSchema>;
