# Matchmaker

Matchmaking for a badminton club's shared weekly match night. Players from both training
groups check in, and each fixed-length round the app puts them on courts: mostly challenging
matches, singles and doubles according to preference, competition pairs together now and
then, and people who haven't met in a while more often. Results adjust a shared, visible
rating.

**Status:** the matchmaking engine is built and tuned with a simulation, and the organiser
app runs a whole match night on one device (laptop or tablet, with the courts on a TV).
Players can check in and follow their court on their own phones once the club's Firebase
project is connected (see [Phones and the cloud](#phones-and-the-cloud)). See
[docs/design.md](docs/design.md) for the decisions so far and
[docs/simulation.md](docs/simulation.md) for what the simulation showed.

## Develop

```bash
npm install
npm run dev          # the app at http://localhost:5173
npm test             # engine, rating and app tests (Vitest)
npm run typecheck    # TypeScript
npm run build        # production build in dist/
npm run sim          # simulate seasons of match nights and print a report
npm run icons        # regenerate the app icons from public/favicon.svg
```

The cloud version, against local Firebase emulators (needs Java 11 or newer):

```bash
npm run emulators    # Firestore and Auth emulators; leave running
npm run dev:cloud    # the app at http://127.0.0.1:5174, using the emulators
npm run test:rules   # the security rules tests (starts its own emulator)
```

In the emulators, "Sign in with Google" offers made-up test accounts. Open the phone view
on another address (`http://localhost:5174` for the organiser, the join link with
`127.0.0.1` for a phone) so the two get separate logins.

New to the app? On an empty Members screen, **Try it with demo players** adds 24 made-up
players; start fresh afterwards with Settings → Delete all data.

## A match night

1. **Members:** add players with their usual group (sets the starting rating), singles or
   doubles preference, and any competition partner.
2. **Tonight:** open the evening (courts, 12 or 15 minute rounds) and tap names to check
   players in. Tap a checked-in player for their energy for the night, "skip next round" or
   checking out.
3. **Round:** make the round, start it, and tap the winning side on each court as games end
   (the score is optional). Save the results and make the next round.
4. **TV:** the TV button opens the court display in its own window. Drag it to the TV and
   tap **Start TV mode** for full screen and sound (the 2-minute warning and the buzzer).
   With a tablet mirrored to the TV, switch to the TV view during play instead.

Without the cloud, everything is saved in the browser on that device; Settings has a backup
download, which is also how to move to another device. With the cloud, players can do steps
2 and 3 themselves on their phones: Settings → **Print the poster** for the QR code.

## Files

- `src/engine/`: the matchmaking engine (`engine.ts`), ratings (`rating.ts`) and seeded
  randomness. Plain TypeScript with no React, DOM or storage access, so the app, the tests
  and the simulation all run the same code.
- `src/app/`: the organiser app (React).
  - `state.ts`: everything the organiser can do, as one reducer over the data in `model.ts`.
  - `storage.ts`: where the data lives on one device (localStorage).
  - `requests.ts`: what phones ask for, checked and turned into actions; `live.ts`: what
    phones see of tonight.
  - `cloud/`: Firebase: the organiser's store on Firestore (`store.ts`), sign-in and club
    setup (`CloudApp.tsx`), the phone's connection (`player.ts`), and the project config
    (`config.ts`).
  - `strings.ts`: all UI text, in Swedish and English.
  - `screens/`: Tonight, Round, Members, TV, the phone (`Play.tsx`) and the poster;
    `components/`: the court drawing, avatars, QR code and other building blocks;
    `styles/`: colours, type and layout.
- `firestore.rules`: who may read and write what in the cloud.
- `sim/`: the simulation, with made-up clubs whose members have a hidden true level.
- `test/`: tests; `test/rules/` tests the security rules in the emulator.

## Deploy

A GitHub Action (`.github/workflows/deploy.yml`) checks, builds and publishes the app to
GitHub Pages at **https://match.ikanos.se** on every push to `main`. One-time setup:

- Repository Settings → Pages → Source: **GitHub Actions**, and Custom domain:
  `match.ikanos.se` (with an Actions deployment the `CNAME` file alone isn't enough).
- DNS: a `CNAME` record for `match.ikanos.se` pointing to `multimike.github.io`.
- Once the certificate is issued, tick **Enforce HTTPS**.

## Phones and the cloud

Phones need a Firebase project (free Spark plan) for the club's data. One-time setup:

1. In the [Firebase console](https://console.firebase.google.com), create a project.
2. **Firestore Database** → Create database → production mode, location
   `europe-north1`.
3. **Authentication** → Sign-in method: enable **Google** and **Anonymous**. Under
   Settings → Authorized domains, add `match.ikanos.se`.
4. **Project settings** → Your apps → add a web app, and copy its `firebaseConfig` into
   `src/app/cloud/config.ts`, and the project ID into `.firebaserc`. The config is public by
   design; the security rules protect the data. (Done for the club: `matchmaker-f9f89`.)
5. Deploy the security rules (once, and again whenever `firestore.rules` changes):

   ```bash
   npx firebase-tools login
   npm run deploy:rules
   ```

6. Push to `main`. The first organiser to sign in on https://match.ikanos.se sets the club
   up and becomes its owner. Data from before, on that device, can be copied to the cloud.

## License

MIT, see [LICENSE](LICENSE).
