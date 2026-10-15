# Matchmaker

Matchmaking for a badminton club's shared weekly match night. Players from both training
groups check in by scanning a QR code, and each fixed-length round the app puts them on
courts: mostly challenging matches, singles and doubles according to preference,
competition pairs together now and then, and people who haven't met in a while more often.
Results adjust a shared, visible rating.

**Status:** the matchmaking engine is built and tuned with a simulation; the app itself is
next. See [docs/design.md](docs/design.md) for the decisions so far and
[docs/simulation.md](docs/simulation.md) for what the simulation showed.

## Develop

```bash
npm install
npm test             # engine and rating tests (Vitest)
npm run typecheck    # TypeScript
npm run sim          # simulate seasons of match nights and print a report
```

- `src/engine/`: the matchmaking engine (`engine.ts`), ratings (`rating.ts`) and seeded
  randomness. Plain TypeScript with no React, DOM or storage access, so the app, the tests
  and the simulation all run the same code.
- `sim/`: the simulation, with made-up clubs whose members have a hidden true level.
- `test/`: tests.

## Planned setup

- React + Vite + TypeScript PWA, around the engine in `src/engine/`.
- Hosted on GitHub Pages at **https://match.ikanos.se**, built by a GitHub Action (not set
  up yet).
- Firebase Firestore (free tier) for check-in from phones and history across weeks.

## License

MIT, see [LICENSE](LICENSE).
