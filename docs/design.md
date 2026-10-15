# Matchmaker: design notes

Decisions so far, from the first design discussion (October 2026). Nothing is built yet.

## Problem

The club's members are split into two groups by level. The best players in group 2 rarely
meet anyone who challenges them, and the weakest in group 1 rarely get to play the top of
their own group. The goal is one shared weekly match night for both groups on many courts,
where:

- everyone gets mostly challenging matches: equal or stronger opponents, with a weaker one
  now and then,
- singles and doubles are mixed according to what each player prefers,
- pairs signed up together for competitions can practise together.

## Scale

- Today: 10–18 players per group on 6 courts.
- Target: one combined session on 8 courts with 24–28 players (more is possible, see
  [Overbooking](#overbooking)).

With these numbers almost nobody has to sit out. The scarce resource is **singles slots**,
not court time:

| Players | Courts | Splits where everyone plays |
|---|---|---|
| 28 | 8 | 6 doubles + 2 singles |
| 24 | 8 | 6D + 0S, 5D + 2S, or 4D + 4S |
| 18 | 6 | 3D + 3S, or 4D + 1S |
| 10 | 6 | 1D + 3S, or 0D + 5S |

## The evening

- **Fixed-length rounds** (12–15 min) with a "last 2 minutes" warning and a buzzer.
  Everyone changes court at the same time.
- The organiser opens an evening. Players check in. Each round: generate, show the courts,
  play, enter results.
- Players can check in and out at any time (late arrivals, early leavers).
- **"Skip next round"** button for a breather.
- **Energy level for the night**, chosen at check-in:
  - 💪 Challenge me: prefer tougher opponents.
  - ⚖️ Normal (default).
  - 😌 Easy night: happy to play down, and can opt in to rest first. This also gives weaker
    players better matches.

## Levels and rating

- One shared scale for both groups, **visible to everyone**. The club already knows who is
  stronger, so this isn't sensitive.
- **No manual pre-ranking.** At sign-up players answer "which group do you usually play
  in?", and that sets the starting rating (group 1 higher). The organiser can nudge obvious
  outliers, but doesn't have to.
- **Results move ratings**, Elo-style: upsets count more than expected wins. In doubles a
  team's strength is the average of the two partners, and both partners move.
- **Provisional players:** large adjustments for the first ~10 matches, and the rating is
  shown as provisional until then.
- **Placement:** players with uncertain ratings are preferably matched against players
  with well-known ratings, which speeds up convergence.
- **The buzzer decides.** Play one normal game to 21. When the buzzer goes, the side in
  the lead wins. A level score is settled by one deciding point, so there are no draws. A
  game that finishes before the buzzer decides the round, and the remaining minutes are free
  play.
- **Result entry:** one tap for the winning side, by either side. The score at the buzzer
  is optional; if it's entered, the winner follows from it, and the rating can use the
  share of points won (a small gain in the simulation).
- Players never set their own level.

## Matchmaking

The engine runs once per round over the checked-in players and searches for the
assignment with the lowest total cost.

1. **Split courts** between singles and doubles so that everyone plays if possible. Hand
   out singles fairly over the evening, weighted by each player's preference (singles /
   doubles / either).
2. **Choose who rests**, if overbooked or the count is odd: volunteers first ("skip next
   round", then easy-night players who opted in), then whoever has rested least. Late
   arrivals count as already rested. Never twice in a row.
3. **Build the matches.** The cost is made of:
   - **Opponent level:** prefer equal or stronger opponents. In every match someone is the
     stronger side, so this is balanced over the evening with a per-player *challenge
     debt*: if you played down, you get priority to play equal or up next. Easy-night
     players don't build up debt.
   - **Partner level:** prefer a similar or slightly stronger partner, with the same debt
     balancing (a slightly stronger partner for you is a slightly weaker one for them).
     Big gaps are fine now and then, capped at about one per evening.
   - **Doubles balance:** the two teams' strengths should be close.
   - **Fixed pairs:** bonus for playing together, with a per-pair "how often" setting (for
     example about half the rounds), so they still mix.
   - **Freshness:** bonus that grows with the time since two players last met, as
     opponents or as partners (weighted separately), across weeks.
   - **Repeats:** penalty for meeting the same opponent or partner again within an evening.

The top players can't play up. For them "challenging" means playing each other.

With 20–40 players this runs instantly in the browser. A randomised search on the cost
function is enough; no server is needed for the logic.

## Overbooking

| Players (8 courts) | Per round | Effect |
|---|---|---|
| ≤ 28 | everyone plays | room for some singles |
| 29–32 | everyone plays | singles disappear, nearly all doubles |
| 36 | 4 rest | each player rests about 1 round in 9 |
| 40 | 8 rest | each player rests about 1 round in 5 |

**v1: no cap and no pre-registration.** Rotation handles the overflow. The organiser view
shows the cost ("34 checked in, about 1 rest in 8 rounds, no singles tonight"), and the
organiser can set a soft limit that triggers a warning.

**Kept open for later:** registration is a separate record from check-in, and the session
has an optional `cap` field, so pre-registration or a hard cap can be added without
touching the engine. Possible steps:

1. **Soft pre-registration:** "I'm coming" during the week, shown as "31 signed up, expect
   some rest rounds". Walk-ins still welcome.
2. **Hard cap**, which brings these trade-offs:
   - Players must sign up in advance, and some will forget and be turned away.
   - No-shows block places: needs a cancellation deadline, a waiting list and a rule for
     releasing unclaimed places.
   - Waiting-list notifications need server code (Cloud Functions), which requires
     Firebase's pay-as-you-go plan with a card registered. The cost at this volume is
     effectively zero.
   - The club must decide who gets the places (first come, missed-last-time, per-group
     quota).
   - The level mix can skew if the keenest players are mostly in one group.
   - Honor system: without real logins, anyone can sign up anyone.

## Onboarding

No accounts, passwords or emails, and nothing to install (adding it to the home screen as
a PWA is optional).

- **One static QR code for the club**, printed on a poster in the hall and shown on the
  court display. Check-in only works while the organiser has an evening open.
- **First time (~20 s):** scan → pick your name from the list (with search) or tap
  **"I'm new"** (name + usual group) → singles / doubles / either → consent checkbox ("my
  name, level and results are visible to club members") → checked in. The phone remembers
  who you are.
- **Self-added players** are flagged as new for the organiser to confirm (duplicates,
  names).
- **Every week after (~3 s):** scan → one big "I'm here" button with the energy level
  (default Normal).
- **Fallbacks:** the organiser checks in players without a phone. Results can be entered
  by a partner or opponent. On a new phone, pick your name again.
- Fixed pairs and level adjustments are handled by the organiser, not in player
  onboarding.

## Look and feel

Stylish and inviting, slightly playful, and unmistakably badminton:

- **Colours:** a confident, fresh palette rather than grey admin-panel tones, for example
  court green or teal with shuttle white and one bright, sporty accent. It must stay
  readable on a TV across the hall and on a phone in a bright sports hall.
- **Badminton graphics:** shuttlecocks, rackets and court lines as icons and decoration.
  For example, a shuttlecock as the app icon and loading animation, and a top-down court
  drawing in the court cards, with players placed on their halves.
- **Playful touches:** friendly microcopy ("Court 3 is calling!"), coloured initial
  avatars, the energy levels as emoji, and small celebrations when results come in. They
  should never get in the way of the 3-second check-in.
- **Court display:** big, bold and scannable from a distance. Court numbers and names
  first, decoration second.

## Architecture

- **React + Vite + TypeScript** PWA. The app has several screens sharing live state (check-in, court
  display, organiser, results), the playful graphics work well as reusable components, and
  Vite bundles the Firebase SDK and the service worker. The trade-off compared with
  sport-timer's no-build setup: a GitHub Action builds and deploys to GitHub Pages at
  `match.ikanos.se` on every push to `main`.
- The engine (`src/engine/`) is plain TypeScript with no React, DOM or storage access, so it runs
  unchanged in the app, the tests and the Node simulation. The organiser's device generates
  the rounds.
- **Firebase Firestore** (free Spark plan) for real-time sync between the organiser's
  device and players' phones, and for history across weeks. Anonymous auth plus security
  rules. Supabase's free tier was ruled out: it pauses projects after a week without
  activity, which is too close to a weekly rhythm.
- Firebase's web config in a public repo is normal. Access is controlled by the security
  rules.
- GDPR: store only first names or nicknames, level, results and preferences. Consent at
  sign-up, and the organiser can delete a member.

### Data model (sketch)

- **members:** name, rating, matches played (provisional until ~10), seed group,
  singles/doubles preference, fixed partner and how often, status (new / confirmed),
  consent date.
- **sessions:** date, courts, round length, soft limit, `cap` (empty for now), state.
- **registrations** (later): session, member. Kept separate from check-ins.
- **checkIns:** session, member, energy level, arrived / left, skip next round.
- **rounds:** session, number, courts (type and teams), resting players.
- **results:** round, court, winning side, optional score.

"Time since last met" is derived from rounds and results.

## Plan

1. **Engine and simulation.** Done: the engine is in `src/engine/`, and the simulation
   and its findings are in [simulation.md](simulation.md).
2. **Organiser app** on a single device: members, check-in, round generation, court
   display, result entry and the round timer.
3. **Firestore sync and QR check-in** on players' phones.
4. **Later, if needed:** pre-registration, then soft or hard cap.

## Open questions

- App language: Swedish, English or both?
- Round length (12 or 15 min) and evening length.
- One rating for both singles and doubles, or separate ratings?
