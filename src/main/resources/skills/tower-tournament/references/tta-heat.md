# Heat Escalation — Captured Example (July 10 Tournament)

Source: user-captured battle report data. Conditions present that tournament: EAS, BU,
RU, ESD (+ standard MB/SD/SRM overheat). This is one concrete instance of the general
heat mechanic described in `SKILL.md` — the milestone-wave list and stepped-escalation
shape generalize to any HEAT condition; the specific level/value numbers below are
specific to these four conditions and this tournament's scaling.

## Condition Definitions

- **Enemy Attack Speed (EAS)** — enemy attack speed increased by x%
- **Boss's Ultimate (BU)** — bosses spawn overhealed by x% (bonus health on spawn)
- **Ranged Ultimate (RU)** — ranged enemy projectiles disable tower firing for x seconds
- **Energy Shields Down (ESD)** — Energy Shield recharge time increased by x%

## Milestone Waves (general mechanic — applies to all HEAT conditions)

```
20, 40, 60, 80, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000
```

Escalation is a **stepped function**: each condition jumps to a new level at each
milestone wave and holds flat until the next one. **Escalation stops at wave 1000** — all
conditions are flat past that point, confirmed by the user.

## Captured Levels/Values by Milestone

| Wave (actual/milestone) | EAS Level | EAS Value | BU Level | BU Value | RU Level | RU Value | ESD Level | ESD Value |
|-------------------------|-----------|-----------|----------|----------|----------|----------|-----------|-----------|
| 20                      | 5         | 25%       | 10       | 10%      | 10       | 0.1s     | 5         | 5%        |
| 40                      | 10        | 50%       | 15       | 15%      | 15       | 0.2s     | 10        | 10%       |
| 80                      | 20        | 100%      | 25       | 25%      | 25       | 0.3s     | 20        | 20%       |
| 100                     | 25        | 125%      | 30       | 30%      | 30       | 0.3s     | 25        | 25%       |
| 150                     | 30        | 150%      | 35       | 35%      | 35       | 0.4s     | 30        | 30%       |
| 200                     | 35        | 175%      | 40       | 40%      | 40       | 0.4s     | 35        | 35%       |
| 250                     | 40        | 200%      | 45       | 45%      | 45       | 0.5s     | 40        | 40%       |
| 300                     | 45        | 225%      | 50       | 50%      | 50       | 0.5s     | 45        | 45%       |
| 350                     | 50        | 250%      | 55       | 55%      | 55       | 0.6s     | 50        | 50%       |
| 400                     | 55        | 275%      | 60       | 60%      | 60       | 0.6s     | 55        | 55%       |
| 450                     | 60        | 300%      | 65       | 65%      | 65       | 0.7s     | 60        | 60%       |
| 600                     | 70        | 350%      | 75       | 75%      | 75       | 0.8s     | 70        | 70%       |
| 700                     | 80        | 400%      | 80       | 80%      | 80       | 0.8s     | 80        | 80%       |
| 800                     | 90        | 450%      | 85       | 85%      | 85       | 0.9s     | 90        | 90%       |
| 900                     | 95        | 475%      | 90       | 90%      | 90       | 0.9s     | 95        | 95%       |
| 1000 (cap)              | 100       | 500%      | 100      | 100%     | 100      | 1.0s     | 100       | 100%      |

## Captured Example 2 — July 14 Tournament (Wave 1-19 baseline, pre-milestone)

Source: user-captured screenshot, waves 1-19 (i.e., the level/value each condition holds
**before** the first wave-20 milestone jump). Conditions present: DR, PU, TU, BU, ESD (+
standard overheat). This is the first captured data for DR, PU, TU, and (correctly
labeled) BU — and it changes some assumptions in `SKILL.md`.

| Condition | Level (waves 1-19) | Exact Mechanic Text (as captured) |
|---|---|---|
| Death Ray Resistance (DR) | 10 | "Instead of destroying enemies, death ray deals 90% enemy health as damage" |
| Protector's Ultimate (PU) | 1 | "Protector shields give knockback, shockwave, and black hole damage immunity (3s Duration / 300s Cooldown)" |
| Tank's Ultimate (TU) | 1 | "Tanks behave like bosses but stop moving once inside tower range (3s Duration / 300s Cooldown)" |
| Basic's Ultimate (BU) | 5 | "Basics have a chance to spawn as different enemies (1% fast, 1% tank, 1% ranged, 1% boss, 1% protector)" |
| Energy Shields Down (ESD) | 1 | "Energy Shield recharge time is increased by 1%" |

### Key findings from this capture

**Conditions do not share a common starting level.** DR is already at Level 10 in the
very first wave bracket while PU/TU/ESD sit at Level 1 and BU at Level 5. This confirms
the open question from Capture 1 — different HEAT conditions have independent level
scales, not a shared 0→100 curve. Don't assume a condition's wave-1-19 value tells you
anything about another condition's wave-1-19 value.

**DR resistance is already strong at the very first bracket** — 90% of enemy health as
damage instead of an outright kill, at Level 10, before wave 20. This means the
Death-Ray-keeps-enemies-alive-for-CL synergy (see `SKILL.md`) is available from the very
start of a run, not something that only kicks in after significant escalation. Enemies
hit by Death Ray under this condition survive at ~10% health — alive and CL-eligible, but
fragile enough that almost anything finishes them.

**PU and TU are periodic pulses, not persistent states.** Both run on a 3s
duration / 300s cooldown pattern at Level 1. This is a meaningfully different mechanic
than a constant passive buff — most of the fight, the protector/tank ultimate is **not**
active; it's a ~1% uptime window (3s / 300s) at this level. Whether higher levels change
the duration/cooldown ratio (more uptime) or just the immunity/behavior strength is not
yet captured.

**TU detail worth reconciling**: this capture says tanks "behave like bosses" during the
active window — which raises the question of whether Plasma Cannon (boss-only per
SKILL.md) becomes situationally relevant against tanks specifically during that 3s
window, since they're classified as bosses at that moment. This wasn't confirmed in
conversation and is worth testing/verifying rather than assuming either way.

**PU detail worth reconciling**: this capture describes protector shields granting
immunity to knockback/shockwave/Black-Hole damage during the pulse — a CC/AoE immunity
window, not a target-priority shift. This is a more specific (and different) mechanic
than the general "they just die a bit later" read discussed earlier — that read may still
be correct as the *practical* effect of PU on run pacing, but the underlying mechanic is
this immunity pulse, not a shield-strength or priority change.

### ⚠️ Discrepancy with Capture 1 (July 10) — needs confirmation

Capture 1 labeled its condition **"Boss's Ultimate (BU)"** with the mechanic "bosses
spawn overhealed by x%." But per the tournament condition catalog (`SKILL.md`) and this
capture, **BU is the acronym for Basic's Ultimate**, not Boss's Ultimate (that's **BOU**).
This capture's Basic's Ultimate mechanic — basics spawning as other enemy types — does
not match Capture 1's "bosses overhealed" description at all, which sounds like it's
actually describing Boss's Ultimate (BOU).

**Likely explanation**: Capture 1's condition was actually BOU (Boss's Ultimate),
mislabeled as BU in the original source file. The level/value numbers in Capture 1's BU
column should probably be re-attributed to BOU rather than BU until confirmed. Flagging
rather than silently correcting — verify against the original July 10 screenshot/source
if possible.

## Open Items

- No captured data yet for OR (Orb Resistance), TR (Thorns Resistance), KR (Knockback
  Resistance), or DD (Death Defy Down) escalation curves. Add a new table here (or a new
  reference file) if/when a battle report captures one of these mid-escalation.
- Need a mid-run or late-run capture of DR/PU/TU/BU to see how level scales with wave
  milestones for these specific conditions (Capture 2 only has the wave 1-19 baseline).
- Need to confirm/resolve the BU vs. BOU labeling discrepancy in Capture 1.
- Need confirmation on whether TU's "behave like bosses" window makes Plasma Cannon
  situationally effective against tanks, and whether PU/TU duration or cooldown improves
  at higher levels (more uptime) vs. just effect strength.
