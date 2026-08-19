---
name: tower-chrono-field
description: >
  Expert knowledge on the Chrono Field (CF) Ultimate Weapon in The Tower: Idle Tower Defense.
  Use this skill whenever the user asks about Chrono Field — including how it works, CF labs,
  Chrono Loop (CF+) orbit and hidden slow mechanics, perma-CF strategy, damage reduction,
  CF range interaction with tower range, module synergies (OC, SD, MH), or stone investment
  priority. Also trigger for questions about CF as a survivability upgrade or CC chain building.
---

# Chrono Field (CF)

## What It Does

Creates a slowing field around the tower for [Duration] seconds every [Cooldown] seconds.
All enemies within CF's range have their movement speed reduced by [–Speed]%. CF range equals
tower range by default — any source that increases tower range (workshop, labs, relics, modules)
also increases CF range. The CF Range lab extends it further beyond tower range.

**CF is the only CC in the game without diminishing returns on its slow.** This makes it the
highest-priority survivability UW for most builds and a prerequisite for deep-run CC chains.

**UW+ — Chrono Loop (CF+)**: Applies a tangential rotational force to all enemies within CF
range, causing them to spiral around the tower instead of approaching linearly. Also applies a
hidden speed slow stacked on top of the base –Speed stat. When CF deactivates, enemies resume
linear movement toward the tower; they take damage normally throughout.

---

## Stats

| Stat | Base | Max | Levels |
|------|:----:|:---:|:------:|
| Duration | 5s | 40s | 36 |
| –Speed | 20% | 75% | 12 |
| Cooldown | 180s | 60s | 13 |

---

## Labs

**Chrono Field Duration** (30 levels, +1s/level): Adds up to +30s of duration on top of the UW
Duration stat. Combined with max UW Duration (40s), total achievable CF duration is 70s.

**Chrono Field Damage Reduction** (1 level unlock): While CF is active, damage taken by the
tower is reduced by 10%. This is a one-time unlock that also gates the next lab.

**Chrono Field Reduction %** (30 levels, +0.5%/level, requires Damage Reduction unlock): Adds
up to +15% additional damage reduction while CF is active, for a combined max of 25%. Reduction
is applied after defense absolute is calculated — it multiplies whatever damage remains after
flat defense is subtracted.

**Chrono Field Range** (20 levels): Extends CF range beyond tower range. Before this lab is
researched, CF range tracks tower range exactly — any workshop, lab, relic, or module source
that increases tower range increases CF range by the same amount.

---

## CF+ — Chrono Loop

CF+ adds two stacking effects on top of base CF:

**Rotation (orbital force)**: Enemies spiral around the tower rather than approaching linearly.
Higher CF+ levels spin enemies faster, increasing how long they stay in the CF field per
activation. At low enough enemy speeds, enemies enter near-permanent orbit during the CF window.

| CF+ Level | Degrees/s | Full Orbit Time |
|:---------:|:---------:|:---------------:|
| 0 | 2.86°/s | 125.7s |
| 5 | 10.03°/s | 36s |
| 10 | 17.19°/s | 21s |
| 13 (Max) | 21.49°/s | 16.8s |

**Hidden slow**: A second speed reduction applied independently of the base –Speed stat. Does
not suffer diminishing returns.

| CF+ Level | Hidden Slow | Effective Speed Multiplier |
|:---------:|:-----------:|:--------------------------:|
| 0 | 2.5% | 0.975× |
| 5 | 25% | 0.75× |
| 10 | 50% | 0.50× |
| 13 (Max) | 65% | 0.35× (~1/3 speed) |

At max CF+ (65% hidden slow) stacked on max base –Speed (75%), enemies move at a fraction of
their normal speed. At this level, combined with sufficient rotation force, enemies with
naturally low speed can orbit indefinitely during the CF window.

---

## Stone Investment Priority

**Duration** — the primary stat. More seconds of active slow means more tower shots per enemy,
more time for module CC abilities to proc, and longer windows of damage reduction. The Duration
lab (+30s) adds significantly more total duration than the UW Duration stat alone; research it
as early as coin budget allows.

**–Speed** — each level directly multiplies the effectiveness of CF's CC. No diminishing
returns. Upgrade freely alongside Duration.

**Cooldown** — the most important stone investment when targeting perma-CF. Floors at 60s
(13 levels from 180s base). See Perma-CF section for how CD interacts with the Galaxy
Compressor module and recovery packages to achieve pseudo-pCF well before max investment.

**CF+ (Chrono Loop)** — high long-term priority. The hidden slow has no diminishing returns and
each level stacks on top of base –Speed. The rotation effect becomes transformative at high
investment. Noted in `tta-uw.md` as a steep lab commitment — CF's labs are long, so starting
CF+ investment early is recommended for players on a damage build trajectory.

Use `get_tower_state` for current CF levels and stones-to-max before making recommendations.

---

## Perma-CF (pCF)

**pCF = Permanent Chrono Field.** When Cooldown ≤ Duration, a new CF activation begins before or
as the previous one ends — keeping enemies permanently slowed (and, once unlocked, the damage
reduction permanently active) rather than cycling on and off. If Duration exceeds Cooldown by
enough, multiple CF activations can overlap simultaneously for the difference between the two.

At full max investment (70s duration, 60s cooldown), there is a 10-second window where two CF
activations overlap. True pCF is achievable before max investment — see the Galaxy Compressor
path below for how to get there faster via recovery-package procs rather than pure stone spend
or via Core Module sub stats.

Having the full 10-second window negates the effects of the Ultimate Weapons battle condition

**Galaxy Compressor (GC) module**: The GC module reduces the cooldown of all UWs except Poison
Swamp each time a recovery package is collected. Stacking recovery package chance via workshop,
labs, and module sub-stats — combined with CF Duration lab investment — brings CF duration and
cooldown close enough that a Mythic or Ancestral GC creates pseudo-pCF through frequent package
procs. This is the primary path to perma-CF before fully maxing UW cooldown levels.

**Core Module substats**: The Generator module has two substats that directly help with
achieving pCF: `Chrono Field - Duration` and `Chrono Field - Cooldown`.  Both of these stats
directly affect the CF Duration and Cooldown. The higher the rarity the greater the effect
and results in needing fewer stones to achieve a pCF. See `references/tta-module-substats.md`
for sub-stat details.

Benefits at perma-CF:
- Enemies take much longer to reach the wall or tower — they can be destroyed before dealing
  any damage
- Enemy speed battle conditions are mitigated continuously
- Damage reduction is always active
- At high CF+ investment, enemies enter near-permanent orbital rotation — path progression
  can stall entirely on slow wave types

---

## Damage Reduction

The Chrono Field Damage Reduction lab (unlock) and Reduction % lab (30 levels) together provide
up to 25% damage reduction while CF is active. This reduction applies after defense absolute —
meaning it is more effective the less flat defense you have, but it scales cleanly at any
defense level. At perma-CF, this damage reduction is always active and stacks with all other
defensive bonuses.

---

## Module Synergies

CF's slow amplifies the crowd-control abilities of several module types. See
`references/tta-natural-epics.md` for full CC ability descriptions.

**Om Chip (OC)**: OC's CC ability causes the Spotlight to snap instantly to a targeted enemy
(typically a boss). When combined with CF, the boss is slowed as it approaches — OC pivots
the Spotlight to it, and SL's damage multiplier is applied to an enemy that can barely move.
This dramatically amplifies damage output against bosses inside the CF window.

**Space Displacer (SD)**: SD's CC ability causes landmines to spawn as Inner Land Mines instead
of normal mines. Inner Land Mines autonomously move and organize around the tower. CF's slow
gives those mines time to reposition into enemy paths before enemies reach the wall or tower,
making it significantly more likely a mine stun is applied.

**Magnetic Hook (MH)**: MH's CC ability fires Inner Land Mines at Bosses as they enter tower
range, and at 25% of Elites. CF's slow gives the mines time to travel from launch point to the
target before the enemy reaches the tower — increasing the likelihood the mine stun lands before
any wall or tower damage occurs.