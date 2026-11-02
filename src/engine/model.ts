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
    rumour: string;
    roll: RollEntry[];
    season: SeasonEntry[];
    stash: string;
  };
  created: string;
  updated: string;
}

let counter = 0;
export const uid = (p = 'x') => `${p}${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
