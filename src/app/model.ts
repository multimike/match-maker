// The organiser app's data, following "Data model" in docs/design.md: members, evenings
// (sessions) with their check-ins and rounds, and the engine's history across evenings. It is
// one plain object, saved as a whole by storage.ts. No React or browser access here, so the
// tests can run a whole evening through state.ts.

import type { Court, Energy, Evening, History, Player, Pref } from '../engine/engine.ts';
import type { Rated, Winner } from '../engine/rating.ts';

export type Group = 1 | 2;

export interface Member {
  id: string;
  name: string;
  /** "Which group do you usually play in?" Sets the starting rating. */
  group: Group;
  rating: number;
  /** Rated matches; the rating is provisional while they're few. */
  matches: number;
  pref: Pref;
  /** Fixed competition partner and how often to pair them (0–1), kept on both partners. */
  partnerId?: string;
  partnerShare?: number;
  /** Players who sign up on their phone are 'new' until the organiser confirms them. */
  status: 'new' | 'confirmed';
  /** When the player agreed, on their phone, to their name, level and results being shown to the club. */
  consentAt?: number;
  createdAt: number;
}

export interface CheckIn {
  memberId: string;
  energy: Energy;
  /** Easy night only: happy to be first to rest. */
  restOk: boolean;
  /** Rests in the next round that starts. */
  skip: boolean;
  arrivedAt: number;
  /** Set when the player leaves; cleared if they check in again. */
  leftAt?: number;
  /** Rating at the first check-in tonight, to show tonight's change. */
  startRating: number;
}

/** Wall-clock milliseconds, so the time left survives a reload and every window agrees. */
export interface Timer {
  durationMs: number;
  startedAt: number | null;
  pausedAt: number | null;
  /** Paused time before the current pause. */
  pausedMs: number;
}

export interface CourtResult {
  winner: Winner;
  /** Score [side A, side B] including any deciding point; optional. */
  score?: [number, number];
}

export type RoundStatus = 'planned' | 'playing' | 'done';

export interface Round {
  id: string;
  number: number;
  courts: Court[];
  resting: string[];
  /** The players as planRound saw them; recordRound needs the same list. */
  players: Player[];
  /** Courts the evening had when the round was made (missing in rounds from before). */
  courtsAvailable?: number;
  status: RoundStatus;
  timer: Timer;
  /** One per court. */
  results: CourtResult[];
  /** Ratings before this round's results, so the latest round's results can be corrected. */
  ratingsBefore?: Record<string, Rated>;
  plannedAt: number;
  finishedAt?: number;
}

export interface Session {
  id: string;
  /** Local date, YYYY-MM-DD. */
  date: string;
  /** Day number for the engine's history: days since 1970-01-01. */
  day: number;
  courts: number;
  roundMinutes: number;
  /** Warn when more players than this are checked in. */
  softLimit?: number;
  /** Hard cap, not used yet: see "Overbooking" in docs/design.md. */
  cap: null;
  /** Friendly evening: same matchmaking, but results don't change ratings or the history. */
  friendly?: boolean;
  state: 'open' | 'closed';
  checkIns: Record<string, CheckIn>;
  rounds: Round[];
  /** The engine's bookkeeping for tonight. */
  evening: Evening;
  openedAt: number;
  closedAt?: number;
}

export interface AppState {
  version: 1;
  members: Member[];
  sessions: Session[];
  /** When each pair last met, across evenings (engine). */
  history: History;
}

export const ROUND_MINUTES = [12, 15] as const;
export const DEFAULT_COURTS = 8;
export const MAX_COURTS = 12;
/** "How often together" choices for competition pairs. */
export const PARTNER_SHARES = [0.25, 0.5, 0.75] as const;
/** Scores at the buzzer: a game is to 21, at most 30. */
export const MAX_SCORE = 30;
/** Longest name a player can give on their phone (the security rules say the same). */
export const MAX_NAME = 40;

export function emptyState(): AppState {
  return { version: 1, members: [], sessions: [], history: { met: {} } };
}

/** YYYY-MM-DD in local time. */
export function localDate(time: number): string {
  const d = new Date(time);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function openSession(state: AppState): Session | undefined {
  return state.sessions.find((s) => s.state === 'open');
}

/** The round being planned or played, or the last finished one. */
export function latestRound(session: Session | undefined): Round | undefined {
  return session?.rounds[session.rounds.length - 1];
}

export function isHere(checkIn: CheckIn | undefined): checkIn is CheckIn {
  return checkIn !== undefined && checkIn.leftAt === undefined;
}

/** Everyone checked in and still here, as the engine sees them, in order of arrival. */
export function tonightsPlayers(state: AppState, session: Session): Player[] {
  const members = new Map(state.members.map((m) => [m.id, m]));
  return Object.values(session.checkIns)
    .filter((c) => isHere(c) && members.has(c.memberId))
    .sort((a, b) => a.arrivedAt - b.arrivedAt)
    .map((c) => {
      const m = members.get(c.memberId)!;
      return {
        id: m.id,
        rating: m.rating,
        matches: m.matches,
        pref: m.pref,
        energy: c.energy,
        partnerId: m.partnerId,
        partnerShare: m.partnerShare,
        restOk: c.energy === 'easy' && c.restOk,
        skip: c.skip,
      };
    });
}

export interface Capacity {
  /** Checked in and still here. */
  here: number;
  /** Of those, skipping the next round. */
  skipping: number;
  /** Playing per round when everyone available plays as much as the courts allow. */
  playing: number;
  /** Resting per round, not counting those who skip. */
  resting: number;
  /** Most singles courts possible with everyone playing. */
  maxSingles: number;
  overLimit: boolean;
}

/** What tonight's numbers mean for the next round: the organiser's view of overbooking. */
export function capacity(here: number, skipping: number, courts: number, softLimit?: number): Capacity {
  const available = Math.max(0, here - skipping);
  const playing = Math.min(4 * courts, available - (available % 2));
  // s singles and d doubles courts: 2s + 4d = playing and s + d <= courts, so s <= 2·courts − playing/2.
  return {
    here,
    skipping,
    playing,
    resting: available - playing,
    maxSingles: Math.min(2 * courts - playing / 2, playing / 2),
    overLimit: softLimit !== undefined && here > softLimit,
  };
}
