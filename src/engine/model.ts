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
  /** old stock needs a seller (11.3) */
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
  /** one of the starting rookies (11.1) */
  rookie: boolean;
  hirePaid?: number;
  notes: string;
  /** states or positions to put on the model when the next battle begins ("starts the next battle Hyped") */
  nextBattle?: string[];
  /** Energy in the battery now; batteries do not refill by themselves (14.3). Missing means full. */
  energy?: number;
  /** an arrival's rumour (13.9): the one chosen, and those disproved */
  rumour?: { name: string | null; disproved: string[]; done?: boolean };
  /** traits outside the budget from madness and the like (Cracked, 8.4) */
  marks?: string[];
  /** the tier of the Word last failed (for "Doubled down", 13.7) */
  lastFailedTier?: string;
  /** the break in which the fighter was hired: no task that break (14.9) */
  hiredBreak?: number;
  /** a weapon built into the chassis (the Prototype, 12.6): free, no Hands, never removed */
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
  /** spectacular hits or Presses landed on an enemy (Box office, 6.2, 12.7) */
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
  /** the enemy named as the mark (12.5) */
  mark?: string;
  research?: { field: number | null; lab: number | null; chosen: 'field' | 'lab' | null; done: boolean };
  /** faction payments made before deployment, by effect id */
  paid?: Record<string, boolean>;
  /** the world, scenario and deployment rolled or chosen (9.1, 9.2, chapter 10) */
  worldRoll?: number | null;
  scenario?: string;
  deploymentRoll?: number | null;
  eventRoll?: number | null;
  /** the season's Final (14.13) */
  final?: boolean;
  /** the crew called its evac (9.6) or broke (9.4) */
  evacuated?: boolean;
  broke?: boolean;
  breakingTests?: Record<string, boolean>;
  /** the round 2 pod (9.7): fell, and what came out if cracked during the battle */
  pod?: { roll: number | null; drop: number | null; ours?: boolean };
}

export interface Captive { price: number | null; refused: boolean; lowest?: boolean; roll?: number | null; xpWho?: string | null }

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
  ransom?: Record<string, { pay: number | null; refuse: boolean }>;
  captive?: { income: number | null; roll: number | null; xpWho: string | null; picks?: Record<string, boolean> };
  /** captives the crew took this battle (14.4): the asked price, ransomed or refused (the fate), and the fate's roll and XP */
  captives?: Captive[];
  taxUnpaid?: string[];
  story: { row: string; roll: number | null; notes: string; leadUsed?: boolean; choice?: string; twistWho?: string | null; twistOk?: boolean | null; picks?: Record<string, boolean>; who?: Record<string, string> };
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

export interface Crew {
  schema: 1;
  id: string;
  rulesVersion: string;
  name: string;
  tape: string;
  faction: string | null;
  subfaction: string | null;
  /** the numbered faction rule the subfaction's rule replaces, chosen at creation (12.1) */
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
  /** old-stock sellers found or not this break (11.3): one roll per item per break */
  sellers?: Record<string, { found: boolean; roll?: number }>;
  breakNo?: number;
  battle?: Battle | null;
  after?: AfterBattle | null;
  /** recruits offered cheaper this break (story events, tasks): discount null means free */
  hireOffers?: { id: string; discount: number | null; note: string; past?: string }[];
  /** a relic lead this break (14.7): one relic at half price */
  relicLead?: { noRoll: boolean } | null;
}

let counter = 0;
export const uid = (p = 'x') => `${p}${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
