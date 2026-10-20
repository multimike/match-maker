# Matchmaker: design notes

Decisions so far, from the first design discussion (October 2026) and from building the
organiser app.

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

- **Fixed-length rounds** (12–15 min on a club night; down to 5 min for kids' training) with a
  "last minute" warning and a buzzer.
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

- One shared scale for every training group, **visible to everyone** in the competitive
  groups. The club already knows who is stronger, so this isn't sensitive.
- **Training groups** (Settings): each has a name and a starting rating, and can **hide
  ratings from its players**, for kids. Those players see no rating, rank or change on their
  phone and are left out of the ranking; organisers still see their ratings, and their
  results still move them, so their matches stay even. One scale for everyone means club-wide
  match sessions, with players from every group, work without anything special: games across
  groups are what keep the scale the same for all of them.
- **No manual pre-ranking.** At sign-up players choose their training group, and that sets
  the starting rating (group 1 higher). The organiser can nudge obvious outliers, but doesn't
  have to. Moving a player to another group keeps a rating that has moved with results; one
  that hasn't starts again from the new group's starting point.
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
  device and players' phones, and for history across weeks. Organisers sign in with Google,
  phones anonymously; security rules decide the rest (see
  [Phones and the cloud](#phones-and-the-cloud-step-3)). Supabase's free tier was ruled out:
  it pauses projects after a week without activity, which is too close to a weekly rhythm.
- Firebase's web config in a public repo is normal. Access is controlled by the security
  rules.
- GDPR: store only first names or nicknames, level, results and preferences. Consent at
  sign-up, and the organiser can delete a member.

### Data model (sketch)

- **groups:** name, starting rating, hide ratings from players.
- **members:** name, rating, matches played (provisional until ~10), training group,
  singles/doubles preference, fixed partner and how often, status (new / confirmed),
  consent date.
- **sessions:** date, courts, round length, soft limit, `cap` (empty for now), state.
- **registrations** (later): session, member. Kept separate from check-ins.
- **checkIns:** session, member, energy level, arrived / left, skip next round.
- **rounds:** session, number, courts (type and teams), resting players.
- **results:** round, court, winning side, optional score.

"Time since last met" is derived from rounds and results.

## Organiser app (step 2)

How the first version of the app works, where it settles details the notes above left open:

- **One device.** The organiser's laptop or tablet runs everything. The TV view (`#/tv`)
  opens in a second window on the same device, to drag to the TV; the two windows stay in
  step through the browser's storage. With a tablet mirrored to the TV, the organiser
  switches between the TV view and the other screens.
- **Sound** (2-minute warning, buzzer, a whistle when a round starts) plays from the TV
  window once its "Start TV mode" button has been tapped, otherwise from the organiser's
  window, never both.
- **Rounds:** make a round, shuffle again if needed, start it (this starts the timer), then
  tap the winning side per court. A round's results are saved together, which updates
  ratings (`rateRound`), the evening (`recordRound`) and the history (`recordHistory`).
  The latest saved round can be corrected until the next one is saved.
- **Scores** are optional and stored with the result. Ratings use only the winner for now;
  the simulation found that the score adds little.
- **Friendly evenings:** chosen when opening the evening. Same matchmaking, timer and
  phones, but saving a round changes no ratings and nothing in the history across weeks;
  only tonight's bookkeeping (rests, singles) is kept, so the evening stays fair. A friendly
  evening left open is closed the next day when an organiser opens the app, or when a new
  evening is opened, so it can't hold up a club night.
- **Courts changing mid-evening:** the number of courts can change at any time and applies
  from the next round made. A round already made remembers how many courts there were; if
  the change matters (it used every court and more came, or it no longer fits), the Round
  screen asks to shuffle again.
- **"Skip next round"** is used up when the next round starts. Rounds that were never saved
  are dropped when the evening ends.
- **Data** is kept in the browser's localStorage behind `src/app/storage.ts` until the cloud
  is set up (step 3). Settings has a backup download and restore.
- **Updates** to the app wait for the organiser to reload, so a new version never restarts
  the app mid-round.
- **Language:** Swedish and English, switchable in the app; all text is in
  `src/app/strings.ts`.

## Phones and the cloud (step 3)

With a Firebase project filled in (`src/app/cloud/config.ts`), the club's data lives in
Firestore and players check in from their phones. Without it, the app runs on one device as
in step 2.

- **Organisers** sign in with Google. The first account to sign in sets the club up and
  becomes its owner; organisers add each other by email address in Settings. The owner
  can't be removed.
- **Players' phones** sign in anonymously, without a login screen, and join the club with
  the code in the QR poster's link (`#/join/<code>`). Without joining, a phone can read
  nothing. **Replace the code** in Settings if the poster has spread beyond the club: the old
  code stops working and every phone is signed out, so everyone scans the new poster.
- **One writer.** Only organisers' devices change the club's data, through the same reducer
  as on one device. Phones send small requests instead ("I'm here", "skip next round", who
  won on my court). The organiser's main window checks each one against the current
  evening and applies it as an ordinary action, or drops it if it no longer makes sense
  (`src/app/requests.ts`). Handling a request twice does no harm. Requests only go through
  while an organiser's app is open, which it is during the evening.
- **Documents:** `club/settings` (organisers and the join code, organisers only),
  `club/members`, `club/groups` (phones read both), `club/history`, `sessions/{id}` (one per evening, organisers only),
  `live/current` (what phones see of tonight), `players/{uid}` (a phone that has joined and
  who it says it is) and `requests/{id}`. Each holds its content as one JSON string, since
  Firestore can't store arrays inside arrays (a court's two sides).
- **Phones read a small live view**, not the evening itself: an evening's document grows
  to around 100 KB, and with 30 phones following every change that would cost each phone
  some 20 MB a night. The live view has tonight's check-ins, the current round, the timer
  and the results, and nothing of the engine's bookkeeping.
- **Offline:** Firestore keeps a copy on each device. The organiser's device carries on
  when the hall's Wi-Fi drops and sends its changes when it comes back. Phones need a
  connection to check in and send results.
- **What a phone shows:** scan the poster; "Who are you?" (tap your name, or "I'm new"); on a
  new phone, your preference and consent; then "I'm here!" with your energy for the night.
  During the evening: your court as a big number with the court drawn from above, the
  timer, and tapping who won; resting rounds; after each round, the result and your rating
  change. Skip next round, change energy and check out are always there.
- **New players** are added as soon as they sign up, marked "New" until an organiser
  confirms them in the member form, where duplicates can also be deleted.
- **Security rules** (`firestore.rules`) are tested against the Firestore emulator
  (`test/rules/`, `npm run test:rules`).
- **The TV link** (`#/tv/<code>`, in Settings) is for a device of its own at the TV: it joins
  with the club's code like a phone, shows the court display from the live view, and can't
  change anything. Replacing the code disconnects it too. On an organiser's device the TV
  view is the same screen, and never handles phones' requests.
- **Limits:** two organiser devices editing the same evening at once can overwrite each
  other's change (the last one wins), so run the evening from one device; the TV window
  only shows. Organisers sign in with a popup: a full-page redirect doesn't work on browsers
  that block third-party storage when the site isn't hosted on Firebase.

## Plan

1. **Engine and simulation.** Done: the engine is in `src/engine/`, and the simulation
   and its findings are in [simulation.md](simulation.md).
2. **Organiser app** on a single device: members, check-in, round generation, court
   display, result entry and the round timer. Done: the app is in `src/app/`; see the
   section above and the README.
3. **Firestore sync and QR check-in** on players' phones. Built (see above); live once the
   club's Firebase project is connected (README).
4. **Later, if needed:** pre-registration, then soft or hard cap.

## Open questions

- Evening length.
- One rating for both singles and doubles, or separate ratings?
