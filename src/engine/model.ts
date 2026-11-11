// The saved shape of a crew. Exported to JSON as-is, so keep it plain data.
export type RatingName = string; // names come from crew-rules.json limits.ratingNames

export type ItemSlot = 'set1' | 'set2' | 'mount' | 'body' | 'frame' | 'belt' | 'fitted' | 'stash';
export type SellerState = 'needed' | 'found' | 'none';

export interface OwnedItem {
  uid: string;
  itemId: string; // `${key}|${source}`
  fighterId: string | null; // null: the crew's stash
  slot: ItemSlot;
  /** set for starting kit items: which kit line they come from */
  kitRef?: string;
  /** old stock needs a seller (9.3) */
  seller?: SellerState;
  sellerRoll?: number;
  /** parts paid in the campaign (creation prices are computed live) */
  paid?: number;
  note?: string;
  /** uses spent of a single-use item (a pair of grenades has two, 7.6) */
  used?: number;
}

export type Advance =
  | { id: string; kind: 'trait'; list: string; name: string; retired?: boolean }
  | { id: string; kind: 'captain'; name: string; retired?: boolean }
  | { id: string; kind: 'rating'; rating: RatingName }
  | { id: string; kind: 'ace'; rating: RatingName };

export interface Legend { id: string; name: string; title: string | null; retired?: boolean }
export interface CaptainTrait { name: string; retired?: boolean }

export interface Fighter {
  id: string;
  name: string;
  title: string;
  species: string;
  type: string | null;
  baseRatings: Record<RatingName, number>;
  gift: boolean;
  rites: boolean;
  ritesKnown: string[];
  captainTraits: CaptainTrait[];
  advances: Advance[];
  legends: Legend[];
  injuries: string[];
  sillyTrait: string | null;
  xp: number;
  status: string;
  word: string;
  past: string;
  history: string[];
  titles: string[];
  /** one of the starting rookies (9.1) */
  rookie: boolean;
  hirePaid?: number;
  notes: string;
  /** states or positions to put on the model when the next battle begins ("starts the next battle Hyped") */
  nextBattle?: string[];
  /** Energy in the battery now; batteries do not refill by themselves (14.3). Missing means full. */
  energy?: number;
  /** an arrival's rumour (13.9): the one chosen, and those disproved */
  rumour?: { name: string | null; disproved: string[]; done?: boolean };
  /** deeds the fighter has fulfilled: never sworn again (13.5) */
  deedsDone?: string[];
  /** statuses the fighter is spared once ("Paste": the next time they would be Sore, they are not, 14.6) */
  wards?: string[];
  /** traits outside the budget from madness and the like (Cracked, 8.4) */
  marks?: string[];
  /** the tier of the Word last failed (for "Doubled down", 13.7) */
  lastFailedTier?: string;
  /** the break in which the fighter was hired: no task that break (14.9) */
  hiredBreak?: number;
  /** a weapon built into the chassis (the Prototype, 10.6): free, no Hands, never removed */
  builtIn?: string | null;
  /** a destroyed bot whose core came home waits for a replacement chassis, bought in the Spend step (13.3) */
  awaitingChassis?: boolean;
}

/** deed: a deed id (S1, B3...) or `rumour:<name>` for an arrival's rumour (13.9). taker: a wager found a taker (13.5). */
export interface BattleWord { deed: string; audience: string; result?: 'fulfilled' | 'failed'; taker?: boolean }

export interface BattleFighter {
  inBattle: boolean;
  energy: number;
  conditions: string[];
  states: string[];
  position: string;
  activated: boolean;
  reactionUsed: boolean;
  dents: number;
  putDowns: number;
  /** put down a rival fighter, or a fighter of a rival crew (14.8) */
  rivalDown?: boolean;
  /** spectacular hits or Presses landed on an enemy (Box office, 6.2, 10.7) */
  spectacular?: number;
  word: BattleWord | null;
  notes: string;
  /** single-use items used this battle, by item uid (grenades, 7.6) */
  thrown?: Record<string, number>;
}

export interface Battle {
  id: string;
  started: string;
  opponent: string;
  opponentFighters: number | null;
  opponentXp: number | null;
  round: number;
  phase: 'setup' | 'playing' | 'ended';
  fighters: Record<string, BattleFighter>;
  log: { round: number; text: string }[];
  winCond: boolean;
  /** fighter credited with the winning condition */
  didJob: string | null;
  heldField: boolean;
  stoodGround: boolean;
  world: string;
  /** the enemy named as the mark (10.5) */
  mark?: string;
  research?: { field: number | null; lab: number | null; chosen: 'field' | 'lab' | null; done: boolean };
  /** faction payments made before deployment, by effect id */
  paid?: Record<string, boolean>;
  /** the world, scenario and deployment rolled or chosen (11.1, 11.2, chapter 12) */
  worldRoll?: number | null;
  scenario?: string;
  deploymentRoll?: number | null;
  eventRoll?: number | null;
  /** the season's Final (15.3) */
  final?: boolean;
  /** the crew called its evac (11.6) or broke (11.4) */
  evacuated?: boolean;
  broke?: boolean;
  breakingTests?: Record<string, boolean>;
  /** the round 2 pod (11.7): fell, and what came out if cracked during the battle */
  pod?: { roll: number | null; drop: number | null; ours?: boolean };
}

/** A captive the crew took (14.4): the asked price; ransomed, or declined and then the fate carried out or Held. */
export interface Captive { price: number | null; refused: boolean; hold?: boolean; lowest?: boolean; roll?: number | null; xpWho?: string | null; name?: string; owner?: string; species?: string; ratings?: Record<string, number> }

/** One of ours Held by another crew (14.4): off the roster, gear with them, bought back at the asked price. */
export interface HeldFighter { fighter: Fighter; items: OwnedItem[]; price: number; captor: string; sinceBreak: number }

/** An enemy fighter this crew Holds for labour (14.4). */
export interface Prisoner { id: string; name: string; owner: string; price: number; species: string; ratings: Record<string, number>; status?: string }

export interface AfterBattle {
  /** the id of the step on screen */
  step: number | string;
  battle: Battle;
  extraXp: Record<string, number>;
  /** steps confirmed, and what each one recorded */
  done?: Record<string, string[]>;
  sillyRolls?: Record<string, number | null>;
  spinOff?: Record<string, string>;
  tookCaptive?: boolean;
  injuries: Record<string, { rolls: number[]; chosen?: number | null; listRolls?: number[]; picks?: Record<string, boolean>; done?: boolean; notes?: string }>;
  ransom?: Record<string, { pay: number | null; refuse: boolean; held?: boolean; price?: number | null }>;
  captive?: { income: number | null; roll: number | null; xpWho: string | null; picks?: Record<string, boolean> };
  /** captives the crew took this battle (14.4): the asked price, ransomed or refused (the fate), and the fate's roll and XP */
  captives?: Captive[];
  taxUnpaid?: string[];
  story: { row: string; roll: number | null; notes: string; leadUsed?: boolean; rolls?: (number | null)[]; choice?: string; twistWho?: string | null; twistOk?: boolean | null; picks?: Record<string, boolean>; who?: Record<string, string> };
  tasks: Record<string, { task: string; success: boolean | null; testTotal: number | null; tableRoll: number | null; paid?: boolean; picks?: Record<string, boolean>; rating?: string; patient?: string | null; teacher?: string | null }>;
  /** decisions made on table results, by path */
  eff?: Record<string, unknown>;
  history: Record<string, string>;
  faction?: { asks: Record<string, boolean | number>; stars: Record<string, number>; researchDone: boolean; researchWho: string | null; applied?: boolean };
  /** a type's put-down XP given to another fighter (Stunt double to an Action star) */
  redirects?: Record<string, string>;
  cancelled?: boolean;
  /** contacts used this break: contact name -> what for */
  contactUse?: Record<string, string>;
  prizeExtra?: number | null;
  podCarried?: boolean;
  // fields from earlier versions, kept so an unfinished break still opens
  xpApplied?: boolean;
  wordsApplied?: Record<string, boolean>;
  taxPaid?: boolean;
  seasonLogged?: boolean;
  captiveXpDone?: boolean;
}

export interface LedgerEntry { id: string; at: string; amount: number; note: string }
export interface RollEntry { id: string; name: string; titles: string; fate: string; note: string }
export interface SeasonEntry { id: string; battle: string; world: string; opponent: string; winCond: string; heldField: string; story: string; points: number }

/** A price change from a story event, for this break only (14.6). */
export interface SpendEffect { kind: 'rechargeDouble' | 'purchase' | 'hire' | 'sale'; amount?: number; used?: boolean; note?: string }

export interface Crew {
  schema: 1;
  id: string;
  rulesVersion: string;
  name: string;
  tape: string;
  faction: string | null;
  subfaction: string | null;
  /** the numbered faction rule the subfaction's rule replaces, chosen at creation (10.1) */
  replacedRule?: number | null;
  captainId: string | null;
  fighters: Fighter[];
  items: OwnedItem[];
  kitPicks: Record<string, string>;
  phase: 'creation' | 'campaign';
  step: number;
  /** parts held, campaign only (creation computes it) */
  parts: number;
  ledger: LedgerEntry[];
  notes: {
    tags: string[];
    contacts: { name: string; used: boolean }[];
    rivals: string[];
    /** a lead about the crew, at most one (14.8): crossed off, it lets the next story event use any row */
    lead: string;
    roll: RollEntry[];
    season: SeasonEntry[];
    stash: string;
  };
  created: string;
  updated: string;
  /** old-stock sellers found or not this break (9.3): one roll per item per break */
  sellers?: Record<string, { found: boolean; roll?: number }>;
  breakNo?: number;
  battle?: Battle | null;
  after?: AfterBattle | null;
  /** recruits offered cheaper this break (story events, tasks): discount null means free */
  hireOffers?: { id: string; discount: number | null; note: string; past?: string }[];
  /** a relic tip this break (14.7): one relic at half price */
  relicLead?: { noRoll: boolean } | null;
  /** our fighters Held by other crews, and the enemy fighters we Hold (14.4) */
  held?: HeldFighter[];
  prisoners?: Prisoner[];
  /** this break's Spend effects (14.6) */
  spendEffects?: SpendEffect[];
}

let counter = 0;
export const uid = (p = 'x') => `${p}${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
