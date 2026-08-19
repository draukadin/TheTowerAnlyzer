# Tournament Reward Structure

Rewards scale by **league** and **placement rank within your bracket**. All leagues award
Gems and Stones; Legends additionally awards Keys (used for Tech Tree upgrades in the
Vault).

## Copper

| Rank | Gems | Stones |
|---|---|---|
| 1 | 100 | 20 |
| 2 | 80 | 18 |
| 3-4 | 65 | 16 |
| 5-6 | 50 | 12 |
| 7-8 | 45 | 10 |
| 9-10 | 40 | 9 |
| 11-12 | 30 | 8 |
| 13-15 | 20 | 7 |
| 16-22 | 15 | 6 |
| 23-30 | 10 | 5 |

## Silver

| Rank | Gems | Stones |
|---|---|---|
| 1 | 200 | 40 |
| 2 | 150 | 35 |
| 3-4 | 100 | 30 |
| 5-6 | 75 | 20 |
| 7-8 | 65 | 19 |
| 9-10 | 60 | 18 |
| 11-12 | 55 | 17 |
| 13-15 | 50 | 16 |
| 16-22 | 45 | 14 |
| 23-30 | 40 | 12 |

## Gold

| Rank | Gems | Stones |
|---|---|---|
| 1 | 300 | 80 |
| 2 | 250 | 70 |
| 3-4 | 200 | 60 |
| 5-6 | 150 | 40 |
| 7-8 | 125 | 30 |
| 9-10 | 100 | 28 |
| 11-12 | 90 | 26 |
| 13-15 | 80 | 24 |
| 16-22 | 70 | 22 |
| 23-30 | 50 | 20 |

## Platinum

| Rank | Gems | Stones |
|---|---|---|
| 1 | 400 | 160 |
| 2 | 350 | 140 |
| 3-4 | 300 | 120 |
| 5-6 | 250 | 70 |
| 7-8 | 225 | 65 |
| 9-10 | 200 | 60 |
| 11-12 | 175 | 56 |
| 13-15 | 150 | 53 |
| 16-24 | 125 | 50 |
| 25-30 | 100 | 20 |

## Champion

| Rank | Gems | Stones |
|---|---|---|
| 1 | 600 | 320 |
| 2 | 500 | 300 |
| 3-4 | 400 | 280 |
| 5-6 | 350 | 200 |
| 7-8 | 325 | 175 |
| 9-10 | 300 | 150 |
| 11-12 | 275 | 125 |
| 13-15 | 250 | 100 |
| 16-24 | 200 | 90 |
| 25-30 | 150 | 20 |

## Legends

Introduces **Keys**, used for Tech Tree upgrades in the Vault.

| Rank | Gems | Stones | Keys |
|---|---|---|---|
| 1 | 800 | 425 | 25 |
| 2 | 700 | 400 | 20 |
| 3-4 | 600 | 375 | 15 |
| 5-6 | 500 | 350 | 10 |
| 7-8 | 475 | 325 | 8 |
| 9-10 | 450 | 300 | 6 |
| 11-12 | 425 | 275 | 4 |
| 13-15 | 400 | 250 | 2 |
| 16-24 | 375 | 225 | 0 |
| 25-30 | 200 | 120 | 0 |

---

## Observations

**Bracket size 30.**

**Stones scale much faster than gems across leagues at rank 1**: Copper 20 → Silver 40 →
Gold 80 → Platinum 160 → Champion 320 → Legends 425 stones for 1st place. Roughly doubling
league-over-league through Champion, then a smaller step into Legends. Gems scale more
linearly (100/200/300/400/600/800) by comparison — meaning climbing leagues is
disproportionately valuable for stone income specifically, which is the bottleneck
resource for UW stone-track and assist-module progression (see `tower-uw` and
`tower-modules` skills).

**The floor drops sharply at the bottom of each bracket.** Rank 25-30 in Platinum (20
stones) and Champion (20 stones) both fall back to roughly Copper-tier stone rewards
despite being much higher leagues — a bottom-of-bracket finish in a high league is barely
better than winning Copper outright for stone income. This matters for the "efficient
wave-to-placement conversion vs. absolute safe/relegate cutoff" framing in `SKILL.md`:
even when surviving relegation via a lucky bracket, a bottom-tier placement within that
bracket captures very little of the league's reward ceiling.

**Mid-pack ranks (9-15) hold up reasonably well relative to top ranks** in the higher
leagues — e.g. Champion rank 9-10 (300 stones) matches rank 2's reward exactly, and rank
13-15 (100 stones) is still 5x the bottom-bracket floor (20 stones). Placing solidly
mid-pack in a high league can out-earn placing 1st in a lower one — worth weighing when
deciding whether pushing for promotion is worth the relegation risk versus consolidating
a comfortable mid-pack finish in the current league.
