# Matchmaker

Matchmaking for a badminton club's shared weekly match night. Players from both training
groups check in by scanning a QR code, and each fixed-length round the app puts them on
courts: mostly challenging matches, singles and doubles according to preference,
competition pairs together now and then, and people who haven't met in a while more often.
Results adjust a shared, visible rating.

**Status:** design phase, no app yet. See [docs/design.md](docs/design.md) for the
decisions so far and the plan.

## Planned setup

- Plain HTML/CSS/JS PWA, no build step, like
  [sport-timer](https://github.com/multimike/sport-timer).
- Hosted on GitHub Pages at **https://match.ikanos.se** (not set up yet).
- Firebase Firestore (free tier) for check-in from phones and history across weeks.

## License

MIT, see [LICENSE](LICENSE).
