# Matchmaker

Matchmaking for a badminton club's shared weekly match night. Players from both training
groups check in, and each fixed-length round the app puts them on courts: mostly challenging
matches, singles and doubles according to preference, competition pairs together now and
then, and people who haven't met in a while more often. Results adjust a shared, visible
rating.

**Status:** the matchmaking engine is built and tuned with a simulation, and the organiser
app runs a whole match night on one device (laptop or tablet, with the courts on a TV).
Next: Firestore sync and QR check-in from players' phones. See
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

Everything is saved in the browser on that device. Settings has a backup download, which is
also how to move to another device.

## Files

- `src/engine/`: the matchmaking engine (`engine.ts`), ratings (`rating.ts`) and seeded
  randomness. Plain TypeScript with no React, DOM or storage access, so the app, the tests
  and the simulation all run the same code.
- `src/app/`: the organiser app (React).
  - `state.ts`: everything the organiser can do, as one reducer over the data in `model.ts`.
  - `storage.ts`: where the data lives (localStorage now, Firestore later).
  - `strings.ts`: all UI text, in Swedish and English.
  - `screens/`: Tonight, Round, Members, TV; `components/`: the court drawing, avatars and
    other building blocks; `styles/`: colours, type and layout.
- `sim/`: the simulation, with made-up clubs whose members have a hidden true level.
- `test/`: tests.

## Deploy

A GitHub Action (`.github/workflows/deploy.yml`) checks, builds and publishes the app to
GitHub Pages at **https://match.ikanos.se** on every push to `main`. One-time setup:

- Repository Settings → Pages → Source: **GitHub Actions**, and Custom domain:
  `match.ikanos.se` (with an Actions deployment the `CNAME` file alone isn't enough).
- DNS: a `CNAME` record for `match.ikanos.se` pointing to `multimike.github.io`.
- Once the certificate is issued, tick **Enforce HTTPS**.

## License

MIT, see [LICENSE](LICENSE).
