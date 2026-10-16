// Requests from players' phones. Phones never change the club's data themselves: they send a
// request, and the organiser's device turns it into ordinary actions here, after checking that
// it still makes sense. A request that doesn't (the evening has closed, a court the player isn't
// on) gives no actions and is dropped. Handling a request twice gives the same result.

import type { Energy, Pref } from '../engine/engine.ts';
import type { Winner } from '../engine/rating.ts';
import { isHere, openSession, type AppState, type CourtResult, type Group } from './model.ts';
import { resultFromScore, validScore } from './results.ts';
import type { Action } from './state.ts';

export type PlayerRequest =
  /** A new player, with consent. The phone has already linked itself to `memberId`. */
  | { type: 'signup'; memberId: string; name: string; group: Group; pref: Pref; consent: true }
  /** An existing member on a new phone: their preference, and consent if not given before. */
  | { type: 'profile'; memberId: string; pref?: Pref; consent?: true }
  | { type: 'checkIn'; memberId: string; energy: Energy; restOk: boolean }
  | { type: 'update'; memberId: string; energy?: Energy; restOk?: boolean; skip?: boolean }
  | { type: 'checkOut'; memberId: string }
  /** Who won on the player's own court, with the score at the buzzer if they entered it. */
  | { type: 'result'; memberId: string; roundId: string; court: number; winner: Winner; score?: [number, number] };

export function requestActions(state: AppState, request: PlayerRequest): Action[] {
  if (request.type === 'signup') {
    return [{ type: 'member/signup', id: request.memberId, name: request.name, group: request.group, pref: request.pref }];
  }
  const member = state.members.find((m) => m.id === request.memberId);
  if (!member) return [];
  const id = member.id;
  const session = openSession(state);

  switch (request.type) {
    case 'profile': {
      const actions: Action[] = [];
      if (request.pref) actions.push({ type: 'member/pref', id, pref: request.pref });
      if (request.consent) actions.push({ type: 'member/consent', id });
      return actions;
    }

    case 'checkIn':
      if (!session) return [];
      return [
        { type: 'checkIn', memberId: id },
        { type: 'checkIn/update', memberId: id, energy: request.energy, restOk: request.restOk },
      ];

    case 'update':
      if (!session || !isHere(session.checkIns[id])) return [];
      return [{ type: 'checkIn/update', memberId: id, energy: request.energy, restOk: request.restOk, skip: request.skip }];

    case 'checkOut':
      return session && isHere(session.checkIns[id]) ? [{ type: 'checkOut', memberId: id }] : [];

    case 'result': {
      // Only while the round is on, and only for the player's own court. Once the organiser has
      // saved the round, corrections are theirs to make.
      const round = session?.rounds.find((r) => r.id === request.roundId);
      const court = round?.courts[request.court];
      if (!round || round.status !== 'playing' || !court?.sides.flat().includes(id)) return [];
      let result: CourtResult = { winner: request.winner };
      if (request.score) {
        const [a, b] = request.score;
        if (!validScore(a) || !validScore(b)) return [];
        result = resultFromScore([a, b], request.winner);
      }
      return [{ type: 'result/set', roundId: round.id, court: request.court, result }];
    }

    default:
      // A request type this version doesn't know (a newer phone): ignore it.
      return [];
  }
}
