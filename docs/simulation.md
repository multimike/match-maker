# Simulation results

The engine was tuned with a simulation before anyone has used it: made-up clubs play whole
seasons of match nights, and we measure how well every player is served. This page sums up
what it showed. The full output from the final run is at the end.

```bash
npm install
npm run sim                   # 3 seasons of 20 evenings, about 12 seconds
npm run sim -- --seasons 1    # quicker
```

## What is simulated

- **A club** of 34 members (other sizes in section 2). Every member has a hidden **true
  level** on the rating scale (average 1500, most between about 1150 and 1850). The coaches
  have split them into two groups by level, but not perfectly, so around the split the best
  of group 2 and the weakest of group 1 overlap. That's the problem being solved.
- **Preferences:** 25% prefer singles, 45% either, 30% prefer doubles. About one in twelve is
  in a competition pair that wants to play together half the time.
- **Each evening:** members come with a 65–95% chance, so about 27 of 34 turn up. 10% pick
  an easy night (half of them happy to rest first) and 15% "challenge me". 10% arrive a
  round or two late, 5% leave early, and anyone may skip a round now and then (3%).
- **20 weekly evenings of 8 rounds.** Winners are drawn from the true levels; ratings start
  from the group and move with the results, exactly as in the app. The engine only ever
  sees the ratings.
- **Everything is measured with true levels**, meaning what players would actually
  experience on court, from evening 6 on, once ratings have had a few weeks to settle.

A match counts as **challenging** for a player when the opposition is equal or better: the
best opponent is at most 50 points below them, and their side isn't more than 50 points
stronger. Playing down now and then is fine. The goal is for everyone to get mostly
challenging matches.

## Findings

**1. The combined night works for the players it's meant to help.** Compared with each
group playing on its own night (6 courts each), using the same engine within each group:

| | Separate groups | Combined night |
|---|---|---|
| Best quarter of group 2: challenging matches | 43% | **61%** |
| Best quarter of group 2: nights meeting a top-quarter player | 10% | **71%** |
| Worst-served 10% of players: challenging matches | 41% | **48%** |
| Close-level pairs who met at least once in the season | 71% | **99%** |
| Different people met per night | 7.8 | **10.5** |

The weakest quarter of group 1 go from 92% to 72% challenging matches: they now also meet
players at their own level from group 2, instead of always playing up. They still meet one
of the club's top quarter on 65% of nights. In the simulation the separate groups already
use this engine. Without an engine, today's self-organised matches probably mix much less,
so real gains are likely larger.

**2. Ratings are what limits match quality, not the matchmaking.** If the engine could see
true levels, challenging matches would reach 80% (worst-served 10%: 67%), against 69% (48%)
with real ratings. After 20 evenings an Elo rating gets about 91% of all pairs of players in
the right order, with a typical error of about 50 points. Two alternatives were tested:

- **A rating that tracks its own uncertainty** (in the spirit of Glicko/TrueSkill) ranked
  players no better than Elo. A doubles result simply says little about each partner. Elo
  stays: it is simple and easy to explain.
- **Entering the score** instead of just the winner gave a small gain: rating error 52 → 47
  points, challenging matches +2 percentage points. So a one-tap "we won" is enough, and
  entering the score can be optional.

**3. Starting from the group is worth asking.** On the first evening, starting everyone
equal gives 56% challenging matches. Starting from the group gives 63%, and with the
organiser fixing the most obviously misplaced players, 64%. "All equal" stays about 3
points behind for the whole 20-week season, because ratings take a long time to make up for
a bad start. The organiser's fixes help mostly in the first weeks.

**4. 24–32 players per night on 8 courts is the sweet spot.** Up to about 28 there is room
for some singles. Above 32 it's nearly all doubles: players who prefer singles get 15% of
their matches as singles at 32 per night, and practically none at 37. Rest rounds grow to
about one per player per night at 37, and almost two at 42. With very few players (11 per night)
matches get more uneven, because there are fewer players near each level.

**5. Preferences are respected.** On a normal night, players who prefer doubles play singles
in 1% of their matches (11–21% on small nights, when the levels leave no other option).
Players who prefer singles get about half their matches as singles, and "either" players
about a third. Competition pairs play together in 51% of the rounds they both play (asked
for: 50%). Nobody has to rest twice in a row.

## Tuning

Starting from first-guess weights, each weight was varied over 6–8 seasons, mainly at 34
members, and checked at 14, 22 and 46. What changed:

| Weight | Before | After | Why |
|---|---|---|---|
| `debt` | 1 | 2 | Stronger catch-up after playing down, which mostly helps the worst-served players |
| `opposition` | 0.5 | 1.5 | Fewer doubles where one player faces opponents far below them |
| `balance` | 1.5 | 2 | Fewer lopsided doubles |
| `partner`, `bigGapPoints` | 0.8, 200 | 1.2, 150 | Fewer very different partners: 0.61 per player per night, was 0.76 |
| `prefersDoubles` | 2 | 10 | Doubles-preferring players got singles in 3% of matches (now 1%), 21% on small nights (now 15%) |
| `fixedPair` | 3 | 8 | Competition pairs together 51% of the time (was 48%), 42% on small nights (was 35%) |

Side by side over the same 8 seasons with 34 members: challenging matches 67% → 68%, the
worst-served 10% 41% → 46%, partner similar or slightly better 61% → 65%, lopsided matches
7% → 6%. The price is a little less variety: 10.7 different people met per night instead of
12.0, and the same partner twice in a night a bit more often (0.56 instead of 0.39 per player
per night, partly because competition pairs now play together more). Most single weights move
the results only a few points: with ratings as noisy as they are, there isn't much more to
gain from the weights.

Two problems found along the way were fixed in the engine: fixed pairs were charged the
"same partner again" cost (which would have split them up after two rounds together), and
leftover singles places on small nights now go to "either" players before anyone who prefers
doubles.

## Caveats

- **True levels never change in the simulation.** Real players improve, juniors quickly. If
  ratings lag behind in practice, the adjustment size (`k` in `rating.ts`) can go up.
- **Results follow the rating model exactly.** Real matches are noisier (form, fatigue,
  partner chemistry), so the real numbers will be somewhat lower.
- **The club is made up.** Preferences, attendance and the level spread are guesses. Once
  the app is in use, the simulation can be re-run with the club's real numbers.

## Full output

```text
Match night simulation: 3 season(s) of 20 evenings, 8 rounds per evening.
Measured with true levels over evenings 6–20, averaged over seasons.

1. TODAY VS ONE COMBINED NIGHT
   A club of 34. Today: each group on its own night with 6 courts. Combined: everyone on 8 courts.
   "Perfect ratings" lets the engine see true levels: impossible in practice, but it shows how
   much is lost to ratings that are never quite right.

                                                  Today  Combined  Perfect ratings
Players per night                                  27.1      27.1             27.1
Challenging matches (equal or better opposition)
  everyone                                          69%       69%              80%
  the worst-served 10% of players                   41%       48%              67%
  best quarter of group 2                           43%       61%              84%
  weakest quarter of group 1                        92%       72%              80%
  top 3 of the club                                 42%       48%              66%
  bottom 3 of the club                              93%       91%              92%
Nights meeting one of the club's top quarter
  best quarter of group 2                           10%       71%              71%
  weakest quarter of group 1                        82%       65%              50%
Clear favourite (playing down)                      14%       13%               6%
Lopsided (200+ points between sides)                 5%        5%               2%
Partner similar or slightly better                  67%       68%              85%
Very different partner, per player per night       0.41      0.52             0.10
Share of matches in singles
  prefers singles                                   72%       48%              47%
  either                                            55%       32%              31%
  prefers doubles                                    6%        1%               4%
Rests per player per night                         0.56      0.37             0.37
Most rests in a row (not asked for)                 1.0       1.0              1.0
Different people met per night                      7.8      10.5             10.0
Same partner again, per player per night           0.70      0.58             0.64
Close-level pairs who met this season               71%       99%              99%
Fixed pairs together (asked for 50%)                43%       51%              52%
Courts mixing both groups                            0%       33%              33%

   Example: evening 10, round 3.
   (true level / rating, group, preference: s = singles, e = either, d = doubles)
   Court 1  doubles  Anna (1650/1727 g1 d) & Julia (1671/1685 g1 e)  vs  Axel (1696/1655 g1 s) & Wilma (1751/1673 g1 s)
   Court 2  doubles  Astrid (1554/1554 g1 s) & Filip (1695/1667 g1 s)  vs  Ida (1565/1567 g1 d) & Maja (1542/1568 g2 d)
   Court 3  doubles  Johan (1617/1585 g1 e) & Lars (1604/1576 g1 s)  vs  Viktor (1545/1563 g1 d) & Anton (1538/1529 g2 d)
   Court 4  doubles  Sara (1470/1521 g1 s) & Oskar (1597/1546 g1 e)  vs  Lucas (1529/1531 g2 e) & Ebba (1519/1429 g2 e)
   Court 5  doubles  Gustav (1391/1460 g2 s) & Elias (1442/1465 g1 s)  vs  Emma (1407/1400 g2 e) & Hanna (1412/1391 g2 s)
   Court 6  singles  Noah (1294/1319 g2 e)  vs  Isak (1365/1408 g2 e)
   Court 7  doubles  Liam (1361/1382 g2 d) & Ella (1397/1355 g2 e)  vs  Alva (1157/1254 g2 d) & Linnea (1414/1389 g2 d)
   Court 8  singles  Maria (1146/1139 g2 s)  vs  Klara (1333/1262 g2 e)

2. NUMBER OF PLAYERS (combined night, 8 courts)

                                                  14 members  22 members  34 members  40 members  46 members  52 members
Players per night                                       11.4        17.7        27.1        32.3        37.0        42.6
Challenging matches (equal or better opposition)
  everyone                                               64%         67%         69%         70%         68%         68%
  the worst-served 10% of players                        36%         43%         48%         41%         36%         42%
  best quarter of group 2                                56%         56%         61%         55%         51%         62%
  weakest quarter of group 1                             58%         63%         72%         85%         82%         79%
  top 3 of the club                                      43%         43%         48%         34%         35%         28%
  bottom 3 of the club                                   86%         89%         91%         93%         91%         93%
Nights meeting one of the club's top quarter
  best quarter of group 2                                84%         53%         71%         67%         65%         69%
  weakest quarter of group 1                             79%         72%         65%         89%         86%         75%
Clear favourite (playing down)                           20%         17%         13%         11%         13%         13%
Lopsided (200+ points between sides)                     15%          5%          5%          3%          3%          3%
Partner similar or slightly better                       61%         63%         68%         66%         65%         64%
Very different partner, per player per night            0.53        0.35        0.52        0.64        0.79        0.69
Share of matches in singles
  prefers singles                                        68%         74%         48%         15%          3%          0%
  either                                                 63%         57%         32%          9%          2%          0%
  prefers doubles                                        21%         11%          1%          0%          0%          0%
Rests per player per night                              0.60        0.47        0.37        0.45        0.97        1.77
Most rests in a row (not asked for)                      1.0         1.0         1.0         1.0         1.0         1.0
Different people met per night                           6.3         7.8        10.5        12.4        13.1        13.0
Same partner again, per player per night                0.52        0.71        0.58        0.57        0.50        0.35
Close-level pairs who met this season                   100%         99%         99%         96%         97%         95%
Fixed pairs together (asked for 50%)                     46%         48%         51%         55%         59%         60%
Courts mixing both groups                                33%         28%         33%         28%         34%         39%

3. STARTING RATINGS (34 members, combined night)
   Challenging matches, and how well ratings order players by true level (1 = perfectly).

Evening  All equal  order  From group  order  Group + fixes  order
1              56%   0.51         63%   0.80            64%   0.83
2              62%   0.63         63%   0.83            66%   0.86
3              63%   0.76         66%   0.87            65%   0.87
4              61%   0.78         64%   0.86            66%   0.88
5              62%   0.82         63%   0.88            68%   0.89
6              61%   0.87         64%   0.90            67%   0.90
8              65%   0.88         68%   0.92            70%   0.91
10             64%   0.88         68%   0.93            70%   0.91
15             70%   0.92         73%   0.95            71%   0.93
20             68%   0.93         71%   0.95            71%   0.93

Engine time per round: median 1.7 ms, slowest 5.8 ms (6240 rounds).
```
