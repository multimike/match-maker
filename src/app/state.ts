// Everything the organiser can do, as one reducer over AppState. It calls the engine
// (planRound, recordRound, recordHistory, rateRound) and stays pure: time, randomness and new
// ids come in through `env`, so the tests can play a whole evening with a seeded random.

import { newEvening, planRound, recordHistory, recordRound, type Energy, type Player, type Pref } from '../engine/engine.ts';
import { rateRound, type Ratings } from '../engine/rating.ts';
import type { Random } from '../engine/random.ts';
import {
  GROUP_START,
  MAX_NAME,
  dayNumber,
  groupStart,
  isHere,
  latestRound,
  localDate,
  openSession,
  tonightsPlayers,
  type AppState,
  type CheckIn,
  type CourtResult,
  type Group,
  type Member,
  type Round,
  type Session,
  type TrainingGroup,
} from './model.ts';
import { addTime, finishTimer, newTimer, pauseTimer, resumeTimer, startTimer } from './timer.ts';

export interface Env {
  now: number;
  random: Random;
  id: () => string;
}

export interface MemberInput {
  name: string;
  group: Group;
  pref: Pref;
  /** null removes the partner. */
  partnerId: string | null;
  partnerShare: number;
}

export type GroupInput = Omit<TrainingGroup, 'id'>;

export type Action =
  /** `id` lets the caller check the new member in straight away. */
  | { type: 'member/add'; member: MemberInput; id?: string }
  | { type: 'member/update'; id: string; member: MemberInput; rating?: number }
  | { type: 'member/delete'; id: string }
  /** A player signing up on their phone: 'new' until the organiser confirms them. */
  | { type: 'member/signup'; id: string; name: string; group: Group; pref: Pref }
  | { type: 'member/confirm'; id: string }
  /** The player agreed on their phone to their name, level and results being shown to the club. */
  | { type: 'member/consent'; id: string }
  | { type: 'member/pref'; id: string; pref: Pref }
  | { type: 'members/import'; members: Member[] }
  | { type: 'group/add'; group: GroupInput }
  | { type: 'group/update'; id: Group; group: GroupInput }
  /** The group's players move to `moveTo` first. */
  | { type: 'group/delete'; id: Group; moveTo: Group }
  | { type: 'session/open'; courts: number; roundMinutes: number; softLimit?: number; friendly?: boolean }
  | { type: 'session/update'; courts?: number; roundMinutes?: number; softLimit?: number | null }
  | { type: 'session/close' }
  | { type: 'checkIn'; memberId: string }
  | { type: 'checkIn/update'; memberId: string; energy?: Energy; restOk?: boolean; skip?: boolean }
  | { type: 'checkOut'; memberId: string }
  | { type: 'round/plan' }
  | { type: 'round/discard' }
  | { type: 'round/start' }
  | { type: 'timer/pause' }
  | { type: 'timer/resume' }
  | { type: 'timer/add'; ms: number }
  | { type: 'timer/finish' }
  | { type: 'result/set'; roundId: string; court: number; result: CourtResult }
  | { type: 'round/save' }
  | { type: 'state/replace'; state: AppState };

export function reduce(state: AppState, action: Action, env: Env): AppState {
  switch (action.type) {
    case 'member/add': {
      const name = action.member.name.trim();
      if (!name || state.members.some((m) => m.id === action.id)) return state;
      const member: Member = {
        id: action.id ?? env.id(),
        name,
        group: action.member.group,
        rating: groupStart(state.groups, action.member.group),
        matches: 0,
        pref: action.member.pref,
        status: 'confirmed',
        createdAt: env.now,
      };
      const members = [...state.members, member];
      return { ...state, members: linkPartner(members, member.id, action.member.partnerId, action.member.partnerShare) };
    }

    case 'member/update': {
      const name = action.member.name.trim();
      if (!name) return state;
      const members = state.members.map((m) => {
        if (m.id !== action.id) return m;
        const { group, pref } = action.member;
        return { ...m, name, group, pref, rating: action.rating ?? regrouped(state.groups, m, group) };
      });
      return { ...state, members: linkPartner(members, action.id, action.member.partnerId, action.member.partnerShare) };
    }

    case 'member/delete': {
      const { id } = action;
      const members = state.members
        .filter((m) => m.id !== id)
        .map((m) => (m.partnerId === id ? withoutPartner(m) : m));
      const met = Object.fromEntries(Object.entries(state.history.met).filter(([key]) => !key.split('|').includes(id)));
      const sessions = state.sessions.map((s) => {
        if (s.state !== 'open' || !s.checkIns[id]) return s;
        const { [id]: _removed, ...checkIns } = s.checkIns;
        return { ...s, checkIns };
      });
      return { ...state, members, sessions, history: { met } };
    }

    case 'member/signup': {
      const name = action.name.trim().slice(0, MAX_NAME);
      // A request handled twice (two organiser devices) must not add the player twice.
      if (!name || state.members.some((m) => m.id === action.id)) return state;
      // A group removed since the phone loaded the list: the first group instead.
      const group = state.groups.some((g) => g.id === action.group) ? action.group : state.groups[0]?.id ?? 1;
      const member: Member = {
        id: action.id,
        name,
        group,
        rating: groupStart(state.groups, group),
        matches: 0,
        pref: action.pref,
        status: 'new',
        consentAt: env.now,
        createdAt: env.now,
      };
      return { ...state, members: [...state.members, member] };
    }

    case 'group/add': {
      const group = cleanGroup(action.group);
      if (!group.name) return state;
      const id = Math.max(0, ...state.groups.map((g) => g.id)) + 1;
      return { ...state, groups: [...state.groups, { id, ...group }] };
    }

    case 'group/update': {
      const before = state.groups.find((g) => g.id === action.id);
      if (!before) return state;
      const group = { id: action.id, ...cleanGroup(action.group) };
      // A name can only be left out for the two groups every club starts with.
      if (!group.name && before.name) return state;
      const groups = state.groups.map((g) => (g.id === action.id ? group : g));
      // Players who haven't played a rated match yet start from the new starting rating.
      const members = state.members.map((m) => (m.group === action.id && m.matches === 0 ? { ...m, rating: group.start } : m));
      return { ...state, groups, members };
    }

    case 'group/delete': {
      const { id, moveTo } = action;
      if (id === moveTo || !state.groups.some((g) => g.id === id) || !state.groups.some((g) => g.id === moveTo)) return state;
      const groups = state.groups.filter((g) => g.id !== id);
      const members = state.members.map((m) => (m.group === id ? { ...m, group: moveTo, rating: regrouped(groups, m, moveTo) } : m));
      return { ...state, groups, members };
    }

    case 'member/confirm':
      return updateMember(state, action.id, (m) => (m.status === 'new' ? { ...m, status: 'confirmed' } : m));

    case 'member/consent':
      return updateMember(state, action.id, (m) => (m.consentAt === undefined ? { ...m, consentAt: env.now } : m));

    case 'member/pref':
      return updateMember(state, action.id, (m) => (m.pref === action.pref ? m : { ...m, pref: action.pref }));

    case 'members/import': {
      const known = new Set(state.members.map((m) => m.id));
      return { ...state, members: [...state.members, ...action.members.filter((m) => !known.has(m.id))] };
    }

    case 'session/open': {
      const date = localDate(env.now);
      const open = openSession(state);
      // A friendly evening someone forgot to end doesn't block a new one on a later day.
      if (open && !(open.friendly && open.date !== date)) return state;
      if (open) state = closeSession(state, env.now);
      const session: Session = {
        id: env.id(),
        date,
        day: dayNumber(date),
        courts: action.courts,
        roundMinutes: action.roundMinutes,
        softLimit: action.softLimit,
        cap: null,
        ...(action.friendly ? { friendly: true } : {}),
        state: 'open',
        checkIns: {},
        rounds: [],
        evening: newEvening(),
        openedAt: env.now,
      };
      return { ...state, sessions: [...state.sessions, session] };
    }

    case 'session/update':
      return updateSession(state, (s) => ({
        ...s,
        courts: action.courts ?? s.courts,
        roundMinutes: action.roundMinutes ?? s.roundMinutes,
        softLimit: action.softLimit === null ? undefined : action.softLimit ?? s.softLimit,
        // A round that hasn't started yet takes the new length.
        rounds: action.roundMinutes === undefined ? s.rounds : s.rounds.map((r) =>
          r.status === 'planned' ? { ...r, timer: newTimer(action.roundMinutes!) } : r),
      }));

    case 'session/close':
      return closeSession(state, env.now);

    case 'checkIn': {
      const member = state.members.find((m) => m.id === action.memberId);
      if (!member) return state;
      return updateSession(state, (s) => {
        const known = s.checkIns[member.id];
        const checkIn: CheckIn = known
          ? { ...known, leftAt: undefined }
          : { memberId: member.id, energy: 'normal', restOk: false, skip: false, arrivedAt: env.now, startRating: member.rating };
        return { ...s, checkIns: { ...s.checkIns, [member.id]: checkIn } };
      });
    }

    case 'checkIn/update':
      return updateCheckIn(state, action.memberId, (c) => {
        const energy = action.energy ?? c.energy;
        return {
          ...c,
          energy,
          restOk: energy === 'easy' ? action.restOk ?? c.restOk : false,
          skip: action.skip ?? c.skip,
        };
      });

    case 'checkOut':
      return updateCheckIn(state, action.memberId, (c) => ({ ...c, leftAt: env.now, skip: false }));

    case 'round/plan': {
      const session = openSession(state);
      const latest = latestRound(session);
      if (!session || latest?.status === 'playing') return state;
      const players = tonightsPlayers(state, session);
      if (players.filter((p) => !p.skip).length < 2) return state;
      const plan = planRound({
        players,
        courts: session.courts,
        evening: session.evening,
        history: state.history,
        today: session.day,
        random: env.random,
      });
      const round: Round = {
        id: env.id(),
        number: plan.round,
        courts: plan.courts,
        resting: plan.resting,
        players,
        courtsAvailable: session.courts,
        status: 'planned',
        timer: newTimer(session.roundMinutes),
        results: plan.courts.map(() => ({ winner: null })),
        plannedAt: env.now,
      };
      // Planning again replaces a round that hasn't started.
      const rounds = latest?.status === 'planned' ? [...session.rounds.slice(0, -1), round] : [...session.rounds, round];
      return updateSession(state, (s) => ({ ...s, rounds }));
    }

    case 'round/discard':
      return updateSession(state, (s) => {
        const latest = latestRound(s);
        return latest && latest.status !== 'done' ? { ...s, rounds: s.rounds.slice(0, -1) } : s;
      });

    case 'round/start':
      return updateSession(state, (s) => {
        const latest = latestRound(s);
        if (latest?.status !== 'planned') return s;
        // "Skip next round" is used up by the round that starts.
        const skipped = new Set(latest.players.filter((p) => p.skip).map((p) => p.id));
        const checkIns = Object.fromEntries(Object.entries(s.checkIns).map(([id, c]) =>
          [id, skipped.has(id) ? { ...c, skip: false } : c]));
        const round: Round = { ...latest, status: 'playing', timer: startTimer(latest.timer, env.now) };
        return { ...s, checkIns, rounds: [...s.rounds.slice(0, -1), round] };
      });

    case 'timer/pause':
      return updatePlaying(state, (r) => ({ ...r, timer: pauseTimer(r.timer, env.now) }));
    case 'timer/resume':
      return updatePlaying(state, (r) => ({ ...r, timer: resumeTimer(r.timer, env.now) }));
    case 'timer/add':
      return updatePlaying(state, (r) => ({ ...r, timer: addTime(r.timer, action.ms, env.now) }));
    case 'timer/finish':
      return updatePlaying(state, (r) => ({ ...r, timer: finishTimer(r.timer, env.now) }));

    case 'result/set': {
      const session = openSession(state);
      const round = session?.rounds.find((r) => r.id === action.roundId);
      if (!session || !round || !round.courts[action.court]) return state;
      const results = round.results.map((r, i) => (i === action.court ? action.result : r));
      if (round.status === 'playing') return replaceRound(state, { ...round, results });
      // A friendly evening's latest round can be corrected too; there are no ratings to redo.
      if (session.friendly) return round.status === 'done' && isLastDone(session, round) ? replaceRound(state, { ...round, results }) : state;
      if (round.status !== 'done' || !isLastDone(session, round) || !round.ratingsBefore) return state;
      // Correcting the latest saved round: rate it again from the ratings it started from.
      const ratings = rateRound({ ...ratingsOf(state.members, round.players), ...round.ratingsBefore }, round, results.map((r) => r.winner));
      return replaceRound({ ...state, members: withRatings(state.members, ratings, round) }, { ...round, results });
    }

    case 'round/save': {
      const session = openSession(state);
      const round = latestRound(session);
      if (!session || round?.status !== 'playing') return state;
      if (session.friendly) {
        // Only tonight's bookkeeping, so rests and singles stay fair through the evening.
        const saved: Round = { ...round, status: 'done', finishedAt: env.now };
        return updateSession(state, (s) => ({
          ...s,
          evening: recordRound(s.evening, round, round.players),
          rounds: [...s.rounds.slice(0, -1), saved],
        }));
      }
      const ratings = ratingsOf(state.members, round.players);
      const onCourt = round.courts.flatMap((c) => c.sides.flat());
      const ratingsBefore = Object.fromEntries(onCourt.map((id) => [id, ratings[id]]));
      const rated = rateRound(ratings, round, round.results.map((r) => r.winner));
      const saved: Round = { ...round, status: 'done', ratingsBefore, finishedAt: env.now };
      return {
        ...state,
        members: withRatings(state.members, rated, round),
        history: recordHistory(state.history, round, session.day),
        sessions: state.sessions.map((s) => s.id !== session.id ? s : {
          ...s,
          evening: recordRound(s.evening, round, round.players),
          rounds: [...s.rounds.slice(0, -1), saved],
        }),
      };
    }

    case 'state/replace':
      return action.state;
  }
}

// Rounds without saved results are dropped: nothing from them reached the ratings.
function closeSession(state: AppState, now: number): AppState {
  return updateSession(state, (s) => ({
    ...s,
    state: 'closed',
    closedAt: now,
    rounds: s.rounds.filter((r) => r.status === 'done').map(({ ratingsBefore: _gone, ...r }) => ({ ...r, players: [] })),
  }));
}

/** A player's rating in a new group: before any rated match it's just the group's starting point. */
function regrouped(groups: TrainingGroup[], m: Member, group: Group): number {
  return m.matches === 0 && group !== m.group ? groupStart(groups, group) : m.rating;
}

function cleanGroup(group: GroupInput): GroupInput {
  const start = Math.round(Math.min(GROUP_START.max, Math.max(GROUP_START.min, group.start)));
  return { name: group.name.trim().slice(0, MAX_NAME), start, ...(group.hideRating ? { hideRating: true } : {}) };
}

function withoutPartner(m: Member): Member {
  const { partnerId: _id, partnerShare: _share, ...rest } = m;
  return rest;
}

// Competition pairs are kept on both partners. Whoever either of them was paired with before is
// let go.
function linkPartner(members: Member[], id: string, partnerId: string | null, share: number): Member[] {
  const current = members.find((m) => m.id === id);
  if (!current || partnerId === id || (partnerId !== null && !members.some((m) => m.id === partnerId))) return members;
  const involved = new Set([id, partnerId, current.partnerId]);
  return members.map((m) => {
    if (m.id === id) return partnerId === null ? withoutPartner(m) : { ...m, partnerId, partnerShare: share };
    if (m.id === partnerId) return { ...m, partnerId: id, partnerShare: share };
    if (m.partnerId !== undefined && (involved.has(m.partnerId) || involved.has(m.id))) return withoutPartner(m);
    return m;
  });
}

function updateMember(state: AppState, id: string, change: (m: Member) => Member): AppState {
  let changed = false;
  const members = state.members.map((m) => {
    if (m.id !== id) return m;
    const next = change(m);
    changed = next !== m;
    return next;
  });
  return changed ? { ...state, members } : state;
}

function updateSession(state: AppState, change: (s: Session) => Session): AppState {
  const session = openSession(state);
  if (!session) return state;
  const next = change(session);
  return next === session ? state : { ...state, sessions: state.sessions.map((s) => (s.id === session.id ? next : s)) };
}

function updateCheckIn(state: AppState, memberId: string, change: (c: CheckIn) => CheckIn): AppState {
  return updateSession(state, (s) => {
    const checkIn = s.checkIns[memberId];
    return isHere(checkIn) ? { ...s, checkIns: { ...s.checkIns, [memberId]: change(checkIn) } } : s;
  });
}

function updatePlaying(state: AppState, change: (r: Round) => Round): AppState {
  const round = latestRound(openSession(state));
  return round?.status === 'playing' ? replaceRound(state, change(round)) : state;
}

function replaceRound(state: AppState, round: Round): AppState {
  return updateSession(state, (s) => ({ ...s, rounds: s.rounds.map((r) => (r.id === round.id ? round : r)) }));
}

function isLastDone(session: Session, round: Round): boolean {
  return session.rounds.filter((r) => r.status === 'done').at(-1)?.id === round.id;
}

// Current ratings for everyone, plus the round's own snapshot for anyone deleted since.
function ratingsOf(members: Member[], players: Player[]): Ratings {
  const ratings: Ratings = {};
  for (const p of players) ratings[p.id] = { rating: p.rating, matches: p.matches ?? 0 };
  for (const m of members) ratings[m.id] = { rating: m.rating, matches: m.matches };
  return ratings;
}

function withRatings(members: Member[], ratings: Ratings, round: Round): Member[] {
  const onCourt = new Set(round.courts.flatMap((c) => c.sides.flat()));
  return members.map((m) => (onCourt.has(m.id) ? { ...m, ...ratings[m.id] } : m));
}
