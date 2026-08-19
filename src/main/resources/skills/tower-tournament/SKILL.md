---
name: tower-tournament
description: "Tournaments in The Tower: battle condition catalog (heat/overheat), how heat escalates across wave milestones, condition-specific tactics, bracket placement mechanics (safe/relegate cutoffs, wave-to-placement efficiency), and forecasting a run against past results."
---

# Tournaments

## How Tournaments Work

Each tournament assigns a bracket (league) and a fixed set of **battle conditions** for
that run. Conditions fall into two categories:

- **HEAT** — conditions that scale up in strength as the run progresses (see Heat
  Escalation below). Typically 4-5 are active per tournament alongside the 3 standard
  overheat conditions.
- **OVERHEAT** — three conditions active in essentially every tournament: **MB** (More
  Bosses), **SD** (Skip Decay), **SRM** (Skip Reduction - Multiply). Treat these as the
  constant baseline difficulty, not a differentiator between tournaments.

Call `get_tournament_history` to see upcoming/past conditions per league, and to look up
the full HEAT/OVERHEAT acronym catalog.

---

## Battle Condition Catalog (HEAT)

| Acronym | Name | Mechanic |
|---|---|---|
| AR | Armored Enemies | Enemies gain armor/damage reduction |
| BU | Basic's Ultimate | Basics have a chance to spawn as a different enemy type instead (fast/tank/ranged/boss/protector, ~1% each per type at Level 5, waves 1-19) |
| BOU | Boss's Ultimate | Bosses spawn overhealed by x%. **Possible mislabel risk**: a July 10 capture recorded this mechanic under the BU acronym, not BOU — see `references/tta-heat.md` discrepancy note |
| CU | Commander's Ultimate | Commander enemies gain an empowered ability |
| DD | Death Defy Down | Your automatic revive (Death Defy) proc rate/effectiveness is reduced |
| DR | Death Ray Resistance | Death Ray's destroy-on-contact effect is converted into % of enemy health as damage instead of an outright kill. Already strong at the very first wave bracket (90% enemy health as damage at Level 10, waves 1-19) — the CL-target-preservation synergy is live from the start of the run, not something that ramps in late |
| EAS | Enemy Attack Speed | Enemy attack speed increased by x% |
| ELS | Enemy Level Skip | Enemy level-skip scaling increased |
| ES | Enemy Speed | Enemy movement speed increased by x% |
| ESD | Energy Shields Down | Energy Shield recharge time increased by x% |
| FU | Fast's Ultimate | Fast enemies gain an empowered ability |
| HD | Health Decay | Tower health decays over time |
| KR | Knockback Resistance | Enemies resist knockback effects (reduces knockback-reliant positioning control, e.g. from Attack Speed procs) |
| MAE | Mass Enforcement | — |
| MEl | More Elites | Increased elite enemy spawn rate |
| ME | More Enemies | Increased overall enemy spawn rate |
| MF | More Fleets | Increased fleet spawn rate |
| OR | Orb Resistance | Enemies take reduced damage from orbs (weakens Extra Orb card) |
| OU | Overcharge's Ultimate | Overcharge enemies gain an empowered ability |
| PC | Plasma Cannon Resistance | Plasma Cannon effectiveness against bosses is resisted |
| PU | Protector's Ultimate | Protector shields grant immunity to knockback, shockwave, and Black Hole damage during a periodic pulse (3s duration / 300s cooldown at Level 1 — roughly 1% uptime at this level). A short CC/AoE-immunity window, not a permanent shield-strength buff |
| RU | Ranged Ultimate | Ranged enemy projectiles disable tower firing for x seconds |
| SU | Saboteur's Ultimate | Saboteur enemies gain an empowered ability |
| TU | Tank's Ultimate | Tanks gain boss-like traits and stop moving once inside tower range, active on a periodic pulse (3s duration / 300s cooldown at Level 1). While active, tanks body-block projectiles/Chain Lightning aimed at enemies behind them (a DPS/target-priority bottleneck, not a wall-pressure/Health Regen threat). Unconfirmed: whether the "behave like bosses" framing makes Plasma Cannon (normally boss-only) situationally effective against tanks during the active window |
| TR | Thorns Resistance | Enemies resist Thorns damage |
| UWD | Ultimate Weapon Durations | UW active-duration effects reduced |

## Battle Condition Catalog (OVERHEAT — always active)

| Acronym | Name |
|---|---|
| MB | More Bosses |
| SD | Skip Decay |
| SRM | Skip Reduction - Multiply |

---

## Heat Escalation

HEAT conditions do not apply at full strength from wave 1 — each one levels up
independently at a shared set of **milestone waves**:

```
20, 40, 60, 80, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000
```

Escalation **stops at wave 1000** — all conditions are flat past that point. See
`references/tta-heat.md` for a captured example (July 10 tournament) showing the
per-condition level/value at each milestone for EAS, BU, RU, and ESD. The shape (18 fixed
steps, independent per-condition curves, same trigger waves) generalizes to any HEAT
condition even though the specific values differ.

**Practical implications:**
- A condition's early-wave behavior can differ meaningfully from its late-wave behavior.
  Don't assume a condition observed as "mild" at wave 50 stays mild at wave 500.
- Because the jumps are discrete (stepped, not continuous drift), effects should be
  visible as sudden changes at specific waves in a report rather than a gradual trend —
  useful for confirming a condition's behavior empirically from your own runs.
- Check where your typical run-ending wave falls relative to the milestone list. Recent
  Champion finishes have clustered 600-900 — meaning most of the escalation curve is
  experienced in a typical run, not just the early mild levels.

---

## Condition-Specific Tactical Notes

**Tank's Ultimate (TU):** the real cost is Chain-Lightning/projectile throughput lost to
tanks soaking hits without dying (they don't press the wall, so Health Regen/CF-slow
positioning value against them is lower than it looks). Plasma Cannon (HP-strip vs
bosses) does **not** help here — Plasma Cannon only affects bosses, not tanks. The actual
answer is burst tools that don't get "blocked" the way CL does (e.g. Death Ray, in
conditions where it's not itself resisted) or raw CL volume to churn through the tank
faster.

**Orb Resistance (OR) and Death Ray Resistance (DR):** these can appear together, which
neuters both non-CL swarm-clear tools (Extra Orb, Death Ray) in the same tournament.
Don't assume the standard "swap Extra Orb for Death Ray" fix applies if DR is also active
that week.

**Death Ray's normal downside:** Death Ray "destroys enemies on contact (except bosses)"
— an outright kill, not damage. Killing too cleanly can starve Chain Lightning of chain
targets (CL needs live enemies nearby to bounce to). Under **DR resistance**, the kill
effect is weakened toward damage-only, which can flip this from a liability into an
asset — enemies survive the beam pass, stay CL-eligible, and are softened up. Verify
empirically by watching CL proc rate in the report; the resistance curve escalates with
heat like everything else (see Heat Escalation), so the synergy window may shrink at
higher waves if resistance climbs enough, though there's no evidence of a low-wave floor
based on the heat curve shape.

**Knockback Resistance (KR):** mutes knockback-based positioning control (e.g. from
Attack Speed procs) but doesn't remove the rest of that card's value — Attack Speed still
drives Chain Lightning/crit proc frequency independent of the knockback effect.

**Death Defy Down (DD):** reduces your automatic-revive reliability. Raises the relative
value of manual safety nets (Second Wind, Demon Mode) since the passive backup is less
dependable that tournament.

---

## Bracket Placement Mechanics

Placement outcome depends on two different lenses that can disagree with each other:

1. **Wave-to-placement conversion efficiency** — given historical data for a specific
   wave total, what placement range is typical? A result near or better than the
   historical Q25 for that wave count is an efficient conversion (top-quartile outcome
   for that wave depth).
2. **Absolute placement distribution / safe-relegate cutoff** — across all brackets, what
   % of finishers at a given placement stay safe vs. get relegated? This cutoff is
   largely fixed (e.g., ~top 38% safe / bottom 62% relegated in observed data) regardless
   of what wave total produced that placement.

A result can be **efficient** (good wave-to-placement conversion) while still being
**nominally in relegation territory** on the absolute distribution — surviving in that
case comes down to the specific bracket's competitive strength that cycle (a "lucky
bracket": weak field, so a placement that's normally risky held up). Cross-reference both
lenses rather than reading placement risk off wave count alone.

**Placement rank within your bracket, not just league, determines reward size.** See
`references/tta-rewards.md` for the full Gems/Stones/Keys table by league and rank. Two
notable patterns from that table: stone rewards scale much faster than gems across
leagues (roughly doubling league-over-league through Champion), and the bottom of any
bracket (rank 25-30) falls back to near-Copper-tier stone rewards regardless of league —
so a bare relegation-survival finish captures very little of a high league's reward
ceiling. Worth factoring in when weighing a promotion push against a comfortable
mid-pack finish in the current league.

### Promotion / Relegation Rule

In a 30-player bracket: **top 4 are promoted**, **bottom 6 are demoted** — but only in
**Platinum and above**. Silver and Copper have no relegation risk: once you climb out of
Gold into Platinum+, a bad Platinum result can still drop you back to Gold, but **Gold
itself is the relegation floor** — you cannot be demoted from Gold to Silver, or from
Silver to Copper, regardless of placement. Below Gold, placement only ever moves you up
or leaves you flat, never down.

For a 30-player bracket this means: 4/30 (~13%) promoted, 20/30 (~67%) hold their
current league regardless of the Platinum+ relegation rule, 6/30 (~20%) demoted (Platinum+
only).

**Legends is currently the ceiling league** — there's no bracket above it, so a top-4
finish in Legends doesn't promote anywhere; it's just the best available reward tier
(see `references/tta-rewards.md`) plus bragging rights. Legends still has its own
relegation risk under the Platinum+ rule (bottom 6 demoted back to Champion), so the
floor/ceiling asymmetry is real: downside risk applies at the top league same as any
other Platinum+ league, but there's no further upside beyond placement/rewards within it.

---

## Forecasting a Run

To forecast an upcoming tournament against a past result:

1. Pull the past run's conditions and version (via battle report / version history) and
   the upcoming run's conditions (`get_tournament_history`).
2. Diff the condition sets — shared conditions carry over risk/counters directly; new
   conditions need fresh tactical read (see Condition-Specific Tactical Notes above).
3. Pull the version history between the two dates (`get_version_history`) to quantify
   stat/module growth in the interim — but treat this as directional, not a guarantee.
   Actual wave results are also driven heavily by enemy-spawn RNG and matchup variance;
   don't expect stat growth alone to translate linearly into wave-depth gains. Validate
   forecasts against actual results afterward (`compare_runs`) and be willing to revise
   the model when a forecast doesn't hold up.
4. Use `compare_runs` on two report numbers to get real per-run telemetry (damage by
   source, enemies destroyed by source, killed-by cause, enemy composition) rather than
   relying on wave totals alone — this surfaces the actual mechanism behind a result
   (e.g., what enemy type ended the run, which damage source carried the kill volume).

---

## Using the tower-analyzer MCP

| Tool | When to call |
|------|-------------|
| `get_tournament_history` | Get conditions for a specific league/date, or the full HEAT/OVERHEAT acronym catalog |
| `compare_runs` | Compare two battle reports by run number — damage breakdown, enemies destroyed by source, killed-by cause, enemy composition deltas |
| `get_recent_runs` with `runType: "Tournament"` | List recent tournament attempts with wave/killed-by/coin summary |
| `get_version_history` | Correlate a report's version to a date, and quantify stat/lab growth between two versions |
| `get_tower_state` (`uw` section) | Check current CF -Speed, CF Duration, CF Cooldown, Chain Lightning Damage stone-track levels |
| `get_cards_state` | Check current tournament preset loadouts before recommending swaps |
