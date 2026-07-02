import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const BASE_URL = 'http://localhost:8080';

const server = new Server(
  { name: 'tower-analyzer', version: '2.0.0' },
  { capabilities: { tools: {} } }
);

// ── Tool definitions ─────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_currencies',
      description: 'Get current coin, gem, stone, shard and other currency balances',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'get_shard_rates',
      description: 'Get shard earning rates and time-to-milestone projections per module type',
      inputSchema: {
        type: 'object',
        properties: {
          dataSource: {
            type: 'string',
            enum: ['BATTLE_REPORTS', 'SNAPSHOTS'],
            description: 'Data source for rate calculation (default: BATTLE_REPORTS)',
          },
          targetLevel: {
            type: 'integer',
            description: 'Target module level for projection (default: 161)',
          },
          windowDays: {
            type: 'integer',
            description: 'Rolling window in days (default: 30)',
          },
        },
      },
    },
    {
      name: 'get_cell_income',
      description: 'Get elite cell earning rate and standard deviation',
      inputSchema: {
        type: 'object',
        properties: {
          windowDays: {
            type: 'integer',
            description: 'Rolling window in days (default: 30)',
          },
        },
      },
    },
    {
      name: 'get_lab_speed_affordability',
      description: 'Get lab speed upgrade affordability: per-slot options, optimal and farming combinations, dead-time stats, and cell reserve burndown',
      inputSchema: {
        type: 'object',
        properties: {
          windowDays:   { type: 'integer', description: 'Rolling window in days (default: 30)' },
          cellsOnHand:  { type: 'number',  description: 'Override cells-on-hand for projections' },
          safetyBuffer: { type: 'number',  description: 'Minimum cells to keep in reserve' },
        },
      },
    },
    {
      name: 'get_recent_runs',
      description: 'Get recent battle run summaries. Add "diagnosis" section for per-run failure analysis.',
      inputSchema: {
        type: 'object',
        properties: {
          limit:   { type: 'integer', description: 'Number of runs to return (default: 3)' },
          runType: { type: 'string',  description: 'Filter by run type (e.g. Farming, Tournament)' },
          sections: {
            type: 'array',
            items: { type: 'string', enum: ['summary', 'diagnosis'] },
            description: 'Sections to include. Defaults to ["summary"].',
          },
        },
      },
    },
    {
      name: 'compare_runs',
      description: 'Compare two battle reports by their run numbers (visible in the front-end report list as #N). Returns a side-by-side delta of all battle sections.',
      inputSchema: {
        type: 'object',
        properties: {
          n1: { type: 'integer', description: 'Run number of the first report' },
          n2: { type: 'integer', description: 'Run number of the second report' },
        },
        required: ['n1', 'n2'],
      },
    },
    {
      name: 'get_tower_state',
      description: 'Get UW stats, module inventory, relic data, module effect bans, and stat contributor breakdown. Use sections to control what is returned.',
      inputSchema: {
        type: 'object',
        properties: {
          sections: {
            type: 'array',
            items: { type: 'string', enum: ['uw', 'modules_active', 'modules_all', 'relic_summary', 'relic_details', 'effect_bans', 'stat_breakdown', 'stat_breakdown_detailed'] },
            description: 'Sections to include. Defaults to ["uw", "modules_active", "relic_summary"]. Use modules_all instead of modules_active for full 24-module swap analysis. Use effect_bans to see which sub-stats are banned per module type and how many ban slots are available. Use stat_breakdown for a per-stat aggregate summary showing effective workshop values and total relic bonuses. Use stat_breakdown_detailed for the full per-contributor breakdown listing each workshop item level, each owned relic, and each equipped module substat.',
          },
        },
      },
    },
    {
      name: 'get_lab_state',
      description: 'Get all lab levels, targets, and effective speed/cost multipliers',
      inputSchema: {
        type: 'object',
        properties: {
          hideMaxed: {
            type: 'boolean',
            description: 'Exclude labs already at max level (default: true)',
          },
          category: {
            type: 'string',
            description: 'Filter to a specific category (e.g. "Main", "Attack", "Defense")',
          },
        },
      },
    },
    {
      name: 'get_workshop_state',
      description: 'Get Workshop and Workshop+ item levels, unlock state, discounts, and presets.',
      inputSchema: {
        type: 'object',
        properties: {
          sections: {
            type: 'array',
            items: { type: 'string', enum: ['items', 'unlock_progress', 'discounts', 'presets', 'spend'] },
            description: 'Sections to include. Defaults to ["items", "unlock_progress"].',
          },
          category: {
            type: 'string',
            enum: ['Attack', 'Defense', 'Utility'],
            description: 'Filter items and progress to a single category.',
          },
        },
      },
    },
    {
      name: 'get_card_details',
      description: 'Get full progression details for a single card by name: current star level and stat value, stat at every level (1–7), copies owned, copies remaining toward the next star and toward max (level 7), gem cost to max, mastery state (stone cost, unlock status, values per level, stones to max), and which presets the card is currently equipped in.',
      inputSchema: {
        type: 'object',
        properties: {
          cardName: {
            type: 'string',
            description: 'The card name (case-insensitive), e.g. "Damage", "Death Ray", "Wave Accelerator".',
          },
        },
        required: ['cardName'],
      },
    },
    {
      name: 'get_cards_state',
      description: 'Get card collection, slot unlock state, and card presets.',
      inputSchema: {
        type: 'object',
        properties: {
          sections: {
            type: 'array',
            items: { type: 'string', enum: ['cards', 'slots', 'presets'] },
            description: 'Sections to include. Defaults to ["cards", "slots"].',
          },
        },
      },
    },
    {
      name: 'get_bots_state',
      description: 'Get bot unlock state, stat levels, and bot presets.',
      inputSchema: {
        type: 'object',
        properties: {
          sections: {
            type: 'array',
            items: { type: 'string', enum: ['bots', 'presets'] },
            description: 'Sections to include. Defaults to ["bots"].',
          },
        },
      },
    },
    {
      name: 'get_guardian_state',
      description: 'Get guardian chip acquisition state, slot unlock state, and guardian presets.',
      inputSchema: {
        type: 'object',
        properties: {
          sections: {
            type: 'array',
            items: { type: 'string', enum: ['chips', 'slots', 'presets'] },
            description: 'Sections to include. Defaults to ["chips", "slots"].',
          },
        },
      },
    },
    {
      name: 'get_tournament_history',
      description: 'Get tournament history and known battle conditions.',
      inputSchema: {
        type: 'object',
        properties: {
          sections: {
            type: 'array',
            items: { type: 'string', enum: ['tournaments', 'conditions'] },
            description: 'Sections to include. Defaults to ["tournaments", "conditions"].',
          },
          league: {
            type: 'string',
            enum: ['SILVER', 'GOLD', 'PLATINUM', 'CHAMPION', 'LEGENDS'],
            description: 'Filter tournaments to a specific league.',
          },
        },
      },
    },
    {
      name: 'get_tier_pbs',
      description: 'Get all tier personal bests with dissonance wave counts and computed boost values.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'get_version_history',
      description: 'Get tower version history. Add "changes" section for per-version change details.',
      inputSchema: {
        type: 'object',
        properties: {
          sections: {
            type: 'array',
            items: { type: 'string', enum: ['versions', 'changes'] },
            description: 'Sections to include. Defaults to ["versions"].',
          },
          limit: { type: 'integer', description: 'Maximum number of versions to return (default: 10)' },
        },
      },
    },
    {
      name: 'get_pending_changes',
      description: 'Get unprocessed player-state changes recorded since the last version entry was created. Use this to help draft the next version history entry — review the changes, suggest a version bump type (patch/minor/major), discuss with the user, then call createVersion via the API.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'get_cosmetics',
      description: 'Get cosmetic item ownership grouped by category, with bonus-per-item rates.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'get_lab_slots',
      description: 'Get all 5 lab slot configurations: cell-speed multiplier, queued plan list, total queue cost and duration, and current coins-per-day burn rate.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'get_lab_plan',
      description: 'Get the active research plan for each lab slot: what is currently being researched, its coin cost and estimated duration, what is queued next, and which slots are idle. Use this for lab prioritization advice, time-to-completion estimates, and identifying idle slots.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'get_lab_costs',
      description: 'Get the per-level coin cost and duration for a specific lab by name.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Lab name (case-insensitive)',
          },
        },
        required: ['name'],
      },
    },
    {
      name: 'get_labs',
      description: 'Get the lab catalog: name, category, description, unlock requirement, max level, and current player level. Use to browse all labs or filter by category. Prefer search_labs when the user names a specific lab.',
      inputSchema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Filter to a specific category (e.g. "Main", "Attack", "Defense", "Utility", "Ultimate Weapons", "Cards", "Perks", "Bots", "Enemies", "Modules", "Battle Condition")',
          },
        },
      },
    },
    {
      name: 'search_labs',
      description: 'Search labs by name or description using a partial, case-insensitive query. Use this whenever the user names a specific lab and you are not certain of the exact DB name — it handles typos and word-order differences. Returns matching labs with full catalog detail and current player level.',
      inputSchema: {
        type: 'object',
        properties: {
          q: {
            type: 'string',
            description: 'Search query — matched against lab name and description',
          },
        },
        required: ['q'],
      },
    },
    {
      name: 'get_shortest_labs_to_max',
      description: 'Given a time budget in days, list labs (not yet maxed) that can be fully researched to max level within that budget, with total remaining coin cost and duration after current speed/cost multipliers are applied. Sorted shortest-duration first. Use to suggest quick-win labs for an idle lab slot.',
      inputSchema: {
        type: 'object',
        properties: {
          maxDays: {
            type: 'integer',
            description: 'Maximum research duration budget, in days',
          },
          cellSpeedMulti: {
            type: 'number',
            description: 'Additional cell-speed multiplier from the target slot\'s equipped cells (default: 1.0). Use a specific slot\'s cellSpeedMult from get_lab_slots when checking that slot.',
          },
        },
        required: ['maxDays'],
      },
    },
    {
      name: 'get_perks',
      description: 'Get the full perk catalog: id, name, type (Standard/UW/TradeOff), and max picks per run.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'get_perk_settings',
      description: 'Get the current perk ban list and auto-pick ranking order.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'get_perk_wave_cost',
      description: 'Compute the wave cost to earn each perk across the four base breakpoints (200/250/300/350), given the current Waves Required and Standard Perks Bonus lab levels plus the number of Perk Wave Requirement (PWR) perks already picked this run.',
      inputSchema: {
        type: 'object',
        properties: {
          pwrPicks: {
            type: 'integer',
            description: 'Number of Perk Wave Requirement perks picked so far this run (default: 0)',
          },
          targetWave: {
            type: 'integer',
            description: 'Optional wave target — response will include how many perks are reachable at that wave',
          },
        },
      },
    },
    {
      name: 'get_module_leveling_cost',
      description: 'Returns the total shards and coins needed to level a module from fromLevel to toLevel (max 300). Use for leveling feasibility checks and shard-to-target projections.',
      inputSchema: {
        type: 'object',
        properties: {
          fromLevel: {
            type: 'integer',
            description: 'Current module level (>= 1)',
          },
          toLevel: {
            type: 'integer',
            description: 'Target module level (<= 300)',
          },
        },
        required: ['fromLevel', 'toLevel'],
      },
    },
    {
      name: 'get_sl_coverage_efficiency',
      description: 'Compute Spotlight coverage-per-stone for the next Angle level vs. the next Quantity level, given the player\'s current SL stat levels. Effective coverage = Angle (degrees) × Quantity (beams). Use to decide whether to invest the next stone in Angle or Quantity.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'get_gt_income_projection',
      description: 'Compute projected Golden Tower income for a run using GT+ compounding formula. Returns projected income, perma-GT income, marginal value of +1s GT duration, and a comparison table across key duration milestones (15–53s). Use to advise whether to invest next stone in GT Duration vs GT+ level vs GT Cooldown.',
      inputSchema: {
        type: 'object',
        properties: {
          runType: {
            type: 'string',
            description: 'Run type to derive KPS and duration from (default: Farming)',
          },
          runsWindow: {
            type: 'integer',
            description: 'Number of recent runs to average for KPS/duration (default: 5)',
          },
        },
      },
    },
  ],
}));

// ── Request handler ──────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  try {
    switch (name) {

      // ── Currencies ────────────────────────────────────────────────────────

      case 'get_currencies':
        return distillCurrencies(await fetchApi('/api/player-tracker/currencies'));

      // ── Shard rates ───────────────────────────────────────────────────────

      case 'get_shard_rates': {
        const dataSource  = args.dataSource  ?? 'BATTLE_REPORTS';
        const targetLevel = args.targetLevel ?? 161;
        const days        = args.windowDays  ?? 30;

        const [stateData, labState] = await Promise.all([
          fetchApi('/api/player-tracker/state'),
          fetchApi('/api/player-tracker/lab-state'),
        ]);

        const modules = stateData.modules ?? [];
        // lab-state returns a flat array; each entry has a `currentLevel` field (LabData record)
        const shardDiscount = (labState.labs ?? [])
          .find(l => l.name === 'Module Shards Cost')?.currentLevel ?? 0;

        const moduleLevels = {
          cannonLevel:            modules.find(m => m.type === 'Cannon'    && m.owned)?.level ?? 0,
          armorLevel:             modules.find(m => m.type === 'Armor'     && m.owned)?.level ?? 0,
          generatorLevel:         modules.find(m => m.type === 'Generator' && m.owned)?.level ?? 0,
          coreLevel:              modules.find(m => m.type === 'Core'      && m.owned)?.level ?? 0,
          shardCostDiscountLevel: shardDiscount,
        };

        const params = new URLSearchParams({ dataSource, targetLevel, days, ...moduleLevels });
        return distillShardRates(await fetchApi(`/api/analysis/shards?${params}`), dataSource);
      }

      // ── Cell income ───────────────────────────────────────────────────────

      case 'get_cell_income': {
        const days = args.windowDays ?? 30;
        return distillCellIncome(await fetchApi(`/api/analysis/cells?days=${days}`));
      }

      // ── Lab speed affordability ───────────────────────────────────────────

      case 'get_lab_speed_affordability': {
        const params = new URLSearchParams();
        if (args.windowDays   != null) params.set('days',         args.windowDays);
        if (args.cellsOnHand  != null) params.set('cellsOnHand',  args.cellsOnHand);
        if (args.safetyBuffer != null) params.set('safetyBuffer', args.safetyBuffer);
        const qs = params.toString();
        return distillLabSpeedAffordability(await fetchApi(`/api/analysis/lab-speed${qs ? `?${qs}` : ''}`));
      }

      // ── Recent runs ───────────────────────────────────────────────────────

      case 'get_recent_runs': {
        const limit    = args.limit   ?? 3;
        const sections = args.sections ?? ['summary'];
        validateSections(sections, ['summary', 'diagnosis']);

        // Backend has no limit param — fetch all and slice client-side
        const qs = args.runType ? `?runType=${encodeURIComponent(args.runType)}` : '';
        const allRuns = await fetchApi(`/api/reports${qs}`);
        const runs = allRuns.slice(0, limit);

        let diagnoses = {};
        if (sections.includes('diagnosis')) {
          const results = await Promise.allSettled(
            runs.map(r => fetchApi(`/api/reports/${r.id}/diagnosis`))
          );
          runs.forEach((r, i) => {
            if (results[i].status === 'fulfilled') diagnoses[r.id] = results[i].value;
          });
        }

        // Fetch tournament conditions for any run that has a linked tournament
        let tournamentConditionMap = {};
        const linkedTournamentIds = [...new Set(runs.filter(r => r.tournamentId != null).map(r => r.tournamentId))];
        if (linkedTournamentIds.length > 0) {
          const tournaments = await fetchApi('/api/tournaments');
          for (const t of tournaments) {
            if (linkedTournamentIds.includes(t.id)) {
              tournamentConditionMap[t.id] = {
                date:       t.date,
                league:     t.league,
                conditions: (t.conditions ?? []).map(c => c.acronym),
              };
            }
          }
        }

        return distillRecentRuns(runs, sections.includes('diagnosis'), diagnoses, tournamentConditionMap);
      }

      // ── Compare runs ──────────────────────────────────────────────────────

      case 'compare_runs': {
        const { n1, n2 } = args;
        if (!Number.isInteger(n1) || !Number.isInteger(n2))
          throw new Error('n1 and n2 must be integers');
        const [r1, r2, delta] = await fetchApi(`/api/reports/compare?n1=${n1}&n2=${n2}`);
        return distillComparison(n1, n2, r1, r2, delta);
      }

      // ── Tower state ───────────────────────────────────────────────────────

      case 'get_tower_state': {
        const sections = args.sections ?? ['uw', 'modules_active', 'relic_summary'];
        validateSections(sections, ['uw', 'modules_active', 'modules_all', 'relic_summary', 'relic_details', 'effect_bans', 'stat_breakdown', 'stat_breakdown_detailed']);

        const [state, bans, summary, breakdown] = await Promise.all([
          fetchApi('/api/player-tracker/state'),
          sections.includes('effect_bans')             ? fetchApi('/api/modules/bans')       : null,
          sections.includes('stat_breakdown')          ? fetchApi('/api/stats/summary')      : null,
          sections.includes('stat_breakdown_detailed') ? fetchApi('/api/stats/breakdown')    : null,
        ]);

        return distillTowerState(state, sections, bans, summary, breakdown);
      }

      // ── Lab state ─────────────────────────────────────────────────────────

      case 'get_lab_state': {
        const hideMaxed = args.hideMaxed !== false;
        const category  = args.category ?? null;
        return distillLabState(await fetchApi('/api/player-tracker/lab-state'), hideMaxed, category);
      }

      // ── Workshop state ────────────────────────────────────────────────────

      case 'get_workshop_state': {
        const sections = args.sections ?? ['items', 'unlock_progress'];
        validateSections(sections, ['items', 'unlock_progress', 'discounts', 'presets', 'spend']);
        const categoryFilter = args.category ?? null;

        const needsItems    = sections.includes('items');
        const needsProgress = sections.includes('items') || sections.includes('unlock_progress');

        // Phase 1: all independent fetches in parallel
        const [items, progress, discounts, spend, regularPresets, plusPresets] = await Promise.all([
          needsItems                     ? fetchApi('/api/workshop')                        : null,
          needsProgress                  ? fetchApi('/api/workshop/plus/unlock-progress')   : null,
          sections.includes('discounts') ? fetchApi('/api/workshop/discounts')              : null,
          sections.includes('spend')     ? fetchApi('/api/workshop/plus/spend')             : null,
          sections.includes('presets')   ? fetchApi('/api/workshop/presets?isPlus=false')   : null,
          sections.includes('presets')   ? fetchApi('/api/workshop/presets?isPlus=true')    : null,
        ]);

        // Phase 2: per-preset item lists (requires preset IDs from phase 1)
        let presets = null;
        if (sections.includes('presets')) {
          const allPresets = [...(regularPresets ?? []), ...(plusPresets ?? [])];
          const presetItemsList = await Promise.all(
            allPresets.map(p => fetchApi(`/api/workshop/presets/${p.id}/items`))
          );
          presets = allPresets.map((p, i) => ({ ...p, items: presetItemsList[i] }));
        }

        return distillWorkshopState({ items, progress, discounts, spend, presets }, sections, categoryFilter);
      }

      // ── Card details ──────────────────────────────────────────────────────

      case 'get_card_details': {
        const cardName = args.cardName;
        if (!cardName) throw new Error('cardName is required');
        const data = await fetchApi(`/api/cards/by-name/${encodeURIComponent(cardName)}/details`);
        return result(distillCardDetails(data));
      }

      // ── Cards state ───────────────────────────────────────────────────────

      case 'get_cards_state': {
        const sections = args.sections ?? ['cards', 'slots'];
        validateSections(sections, ['cards', 'slots', 'presets']);

        // Phase 1
        const [cards, slots, presetList] = await Promise.all([
          sections.includes('cards')   ? fetchApi('/api/cards')        : null,
          sections.includes('slots')   ? fetchApi('/api/cards/slots')  : null,
          sections.includes('presets') ? fetchApi('/api/cards/presets'): null,
        ]);

        // Phase 2: per-preset assignments
        let presets = null;
        if (presetList) {
          const assignmentsList = await Promise.all(
            presetList.map(p => fetchApi(`/api/cards/presets/${p.id}/assignments`))
          );
          presets = presetList.map((p, i) => ({ ...p, assignments: assignmentsList[i] }));
        }

        return distillCardsState({ cards, slots, presets }, sections);
      }

      // ── Bots state ────────────────────────────────────────────────────────

      case 'get_bots_state': {
        const sections = args.sections ?? ['bots'];
        validateSections(sections, ['bots', 'presets']);

        // Phase 1
        const [bots, presetList] = await Promise.all([
          sections.includes('bots')    ? fetchApi('/api/bots')         : null,
          sections.includes('presets') ? fetchApi('/api/bots/presets') : null,
        ]);

        // Phase 2: per-preset unlocks + stat levels (both in parallel across presets)
        let presets = null;
        if (presetList) {
          const [unlocksList, statLevelsList] = await Promise.all([
            Promise.all(presetList.map(p => fetchApi(`/api/bots/presets/${p.id}/unlocks`))),
            Promise.all(presetList.map(p => fetchApi(`/api/bots/presets/${p.id}/stat-levels`))),
          ]);
          presets = presetList.map((p, i) => ({
            ...p,
            unlocks:    unlocksList[i],
            statLevels: statLevelsList[i],
          }));
        }

        return distillBotsState({ bots, presets }, sections);
      }

      // ── Guardian state ────────────────────────────────────────────────────

      case 'get_guardian_state': {
        const sections = args.sections ?? ['chips', 'slots'];
        validateSections(sections, ['chips', 'slots', 'presets']);

        const needsGuardianData = sections.includes('chips') || sections.includes('slots');

        // Phase 1
        const [guardianData, presetList] = await Promise.all([
          needsGuardianData            ? fetchApi('/api/guardian')         : null,
          sections.includes('presets') ? fetchApi('/api/guardian/presets') : null,
        ]);

        // Phase 2: per-preset chips + stat levels
        let presets = null;
        if (presetList) {
          const [chipsList, statLevelsList] = await Promise.all([
            Promise.all(presetList.map(p => fetchApi(`/api/guardian/presets/${p.id}/chips`))),
            Promise.all(presetList.map(p => fetchApi(`/api/guardian/presets/${p.id}/stat-levels`))),
          ]);
          presets = presetList.map((p, i) => ({
            ...p,
            chips:      chipsList[i],
            statLevels: statLevelsList[i],
          }));
        }

        return distillGuardianState({ guardianData, presets }, sections);
      }

      // ── Tournament history ────────────────────────────────────────────────

      case 'get_tournament_history': {
        const sections     = args.sections ?? ['tournaments', 'conditions'];
        const leagueFilter = args.league   ?? null;
        validateSections(sections, ['tournaments', 'conditions']);

        const [tournaments, conditions] = await Promise.all([
          sections.includes('tournaments') ? fetchApi('/api/tournaments')            : null,
          sections.includes('conditions')  ? fetchApi('/api/tournaments/conditions') : null,
        ]);

        return distillTournamentHistory({ tournaments, conditions }, sections, leagueFilter);
      }

      // ── Tier PBs ──────────────────────────────────────────────────────────

      case 'get_tier_pbs':
        return distillTierPbs(await fetchApi('/api/tier-pb'));

      // ── Version history ───────────────────────────────────────────────────

      case 'get_version_history': {
        const sections = args.sections ?? ['versions'];
        validateSections(sections, ['versions', 'changes']);
        const limit = args.limit ?? 10;
        return distillVersionHistory(await fetchApi('/api/versions'), sections, limit);
      }

      // ── Pending version changes ───────────────────────────────────────────

      case 'get_pending_changes':
        return distillPendingChanges(await fetchApi('/api/versions/pending'));

      // ── Cosmetics ─────────────────────────────────────────────────────────

      case 'get_cosmetics':
        return distillCosmetics(await fetchApi('/api/cosmetics'));

      // ── Lab slots ─────────────────────────────────────────────────────────

      case 'get_lab_slots':
        return distillLabSlots(await fetchApi('/api/lab-slots'));

      case 'get_lab_plan':
        return distillLabPlan(await fetchApi('/api/lab-slots'));

      // ── Lab costs ─────────────────────────────────────────────────────────

      case 'get_lab_costs': {
        const allLabs = await fetchApi('/api/labs');
        const lab = allLabs.find(l => l.name.toLowerCase() === args.name.toLowerCase());
        if (!lab) throw new Error(`Unknown lab: ${args.name}`);
        return distillLabCosts(await fetchApi(`/api/labs/${lab.id}/costs`));
      }

      // ── Lab catalog ───────────────────────────────────────────────────────

      case 'get_labs': {
        const qs = args.category ? `?category=${encodeURIComponent(args.category)}` : '';
        return distillLabCatalog(await fetchApi(`/api/labs${qs}`));
      }

      // ── Lab search ────────────────────────────────────────────────────────

      case 'search_labs':
        return distillLabCatalog(await fetchApi(`/api/labs/search?q=${encodeURIComponent(args.q)}`));

      // ── Shortest labs to max ──────────────────────────────────────────────

      case 'get_shortest_labs_to_max': {
        const maxDays = args.maxDays;
        if (!Number.isInteger(maxDays) || maxDays <= 0) throw new Error('maxDays must be a positive integer');
        const cellSpeedMulti = args.cellSpeedMulti ?? 1.0;

        const params = new URLSearchParams({ maxDays, cellSpeed: cellSpeedMulti });
        const [costMap, allLabs] = await Promise.all([
          fetchApi(`/api/labs/shortestLabs?${params}`),
          fetchApi('/api/labs'),
        ]);
        return distillShortestLabsToMax(costMap, allLabs);
      }

      // ── Perk catalog / settings ───────────────────────────────────────────

      case 'get_perks':
        return result(await fetchApi('/api/perks'));

      case 'get_perk_settings':
        return distillPerkSettings(await fetchApi('/api/perks/settings'));

      // ── Perk wave cost ────────────────────────────────────────────────────

      case 'get_perk_wave_cost': {
        const pwrPicks   = args.pwrPicks   ?? 0;
        const targetWave = args.targetWave ?? null;
        const labState   = await fetchApi('/api/player-tracker/lab-state');
        return distillPerkWaveCost(labState, pwrPicks, targetWave);
      }

      // ── Module leveling cost ──────────────────────────────────────────────

      case 'get_module_leveling_cost': {
        const [cost, labState] = await Promise.all([
          fetchApi(`/api/modules/leveling-cost?fromLevel=${args.fromLevel}&toLevel=${args.toLevel}`),
          fetchApi('/api/player-tracker/lab-state'),
        ]);
        return distillModuleLevelingCost(cost, labState);
      }

      // ── GT income projection ──────────────────────────────────────────────

      case 'get_gt_income_projection': {
        const runType    = args.runType    ?? 'Farming';
        const runsWindow = args.runsWindow ?? 5;

        const [uwData, allRuns] = await Promise.all([
          fetchApi('/api/uw'),
          fetchApi(`/api/reports?runType=${encodeURIComponent(runType)}`),
        ]);

        const gt = uwData.find(u => u.code === 'GT');
        if (!gt) throw new Error('GT UW not found in player state');

        const gtPlusStat    = gt.stats.find(s => s.statKey === 'STAT_1');
        const durationStat  = gt.stats.find(s => s.statKey === 'STAT_2');
        const cooldownStat  = gt.stats.find(s => s.statKey === 'STAT_3');

        if (!durationStat || !cooldownStat) throw new Error('GT Duration/Cooldown stats not found');

        const gtPlusLevel   = gtPlusStat?.currentLevel ?? 0;
        const gtDurationSec = durationStat.currentValue;
        const gtCooldownSec = cooldownStat.currentValue;

        const recentRuns = allRuns.slice(0, runsWindow);
        if (recentRuns.length === 0) throw new Error(`No ${runType} runs found`);

        const avgGameTimeSec = recentRuns.reduce((s, r) => s + r.gameTimeSeconds, 0) / recentRuns.length;

        // Fetch full payload of most recent run to get totalEnemies + coinsEarned
        const payload = await fetchApi(`/api/reports/${recentRuns[0].id}`);
        const parsed  = typeof payload === 'string' ? JSON.parse(payload) : payload;
        const sections = parsed.sectionMap ?? parsed;

        const totalEnemies = sections['TOTAL_ENEMIES']?.totalEnemies ?? 0;
        if (totalEnemies === 0) throw new Error('Could not read totalEnemies from latest run payload');

        const kps           = totalEnemies / recentRuns[0].gameTimeSeconds;
        const coinsEarned   = recentRuns[0].coinsPerHour * (recentRuns[0].gameTimeSeconds / 3600);
        const incomePerMob  = coinsEarned / totalEnemies;

        const params = new URLSearchParams({
          gtPlusLevel, gtDurationSec, gtCooldownSec,
          kps, totalRunDurationSec: avgGameTimeSec, incomePerMob,
        });
        const proj = await fetchApi(`/api/analysis/gt-income?${params}`);
        return distillGtIncomeProjection(proj, {
          gtPlusLevel, gtDurationSec, gtCooldownSec,
          kps: round(kps, 3),
          avgRunDurationSec: Math.round(avgGameTimeSec),
          incomePerMob: round(incomePerMob, 2),
          runsUsed: recentRuns.length,
        });
      }

      // ── SL coverage efficiency ────────────────────────────────────────────

      case 'get_sl_coverage_efficiency': {
        const uwData = await fetchApi('/api/uw');
        const sl = uwData.find(u => u.code === 'SP');
        if (!sl) throw new Error('Spotlight UW not found in player state');

        const angleStat    = sl.stats.find(s => s.statKey === 'STAT_2');
        const quantityStat = sl.stats.find(s => s.statKey === 'STAT_3');
        if (!angleStat || !quantityStat) throw new Error('SL Angle/Quantity stats not found');

        const params = new URLSearchParams({
          angleLevel:    angleStat.currentLevel,
          quantityLevel: quantityStat.currentLevel,
          angleDegrees:  angleStat.currentValue,
          quantityBeams: quantityStat.currentValue,
        });
        if (angleStat.stonesToNext    != null) params.set('angleNextStoneCost',    angleStat.stonesToNext);
        if (quantityStat.stonesToNext != null) params.set('quantityNextStoneCost', quantityStat.stonesToNext);

        return distillSlCoverageEfficiency(await fetchApi(`/api/analysis/sl-coverage?${params}`));
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (e) {
    return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
  }
});

// ── HTTP ─────────────────────────────────────────────────────────────────────

async function fetchApi(path) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`);
  } catch (e) {
    throw new Error(`Cannot reach Spring Boot at ${BASE_URL} — is it running? (${e.message})`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${path}`);
  return res.json();
}

// ── Sections validation ───────────────────────────────────────────────────────

function validateSections(requested, valid) {
  const invalid = requested.filter(s => !valid.includes(s));
  if (invalid.length > 0) {
    throw new Error(`Unknown section(s): ${invalid.join(', ')}. Valid options: ${valid.join(', ')}`);
  }
}

// ── Distillation: currencies ──────────────────────────────────────────────────

function distillCurrencies(d) {
  return result({
    coins_T:          round(d.coins.raw / 1e12, 2),
    gems:             d.gems,
    stones:           d.stones,
    medals:           d.medals,
    elite_cells_K:    round(d.eliteCells.raw / 1e3, 2),
    cannon_shards:    d.cannonShards,
    armor_shards:     d.armorShards,
    generator_shards: d.generatorShards,
    core_shards:      d.coreShards,
    reroll_shards:    d.reRollShards,
    bits:             d.bits,
    tokens:           d.tokens,
  });
}

// ── Distillation: shard rates ─────────────────────────────────────────────────

function distillShardRates(d, dataSource) {
  const proj = d.projections;
  return result({
    source:        dataSource,
    runs_analyzed: d.runsAnalyzed,
    cannon:    shardSummary(d.averages.cannon,    d.stdDev.cannon,    proj.cannon),
    armor:     shardSummary(d.averages.armor,     d.stdDev.armor,     proj.armor),
    generator: shardSummary(d.averages.generator, d.stdDev.generator, proj.generator),
    core:      shardSummary(d.averages.core,      d.stdDev.core,      proj.core),
  });
}

function shardSummary(rate, std, proj) {
  return {
    rate:             round(rate, 2),
    std_dev:          round(std, 2),
    next_level_days:  round(proj.hoursToNextLevel  / 24, 1),
    to_target_days:   round(proj.hoursToTargetLevel / 24, 1),
  };
}

// ── Distillation: cell income ─────────────────────────────────────────────────

function distillCellIncome(d) {
  const mean = d.averageCellsPerHour;
  const variance = d.dataPoints.reduce((acc, p) => acc + Math.pow(p.cellsPerHour - mean, 2), 0) / d.dataPoints.length;
  return result({
    runs_analyzed:      d.runsAnalyzed,
    avg_cells_per_hour: round(mean, 2),
    std_dev:            round(Math.sqrt(variance), 2),
  });
}

// ── Distillation: lab speed affordability ─────────────────────────────────────

function distillLabSpeedAffordability(d) {
  return result({
    window_days:              d.windowDays,
    runs_analyzed:            d.runsAnalyzed,
    avg_cells_per_hour:       round(d.averageCellsPerHour, 2),
    effective_cells_per_hour: round(d.effectiveCellsPerHour, 2),
    dead_time: {
      active_hours:       round(d.deadTimeStats.totalActiveHours, 1),
      dead_hours:         round(d.deadTimeStats.totalDeadHours, 1),
      dead_pct:           round(d.deadTimeStats.deadTimePercent, 1),
      hours_since_run:    round(d.deadTimeStats.hoursSinceLastRun, 1),
    },
    cell_reserve: d.cellReserve ? {
      cells_on_hand_K:  round(d.cellReserve.cellsOnHand  / 1e3, 1),
      safety_buffer_K:  round(d.cellReserve.safetyBuffer / 1e3, 1),
      spendable_K:      round(d.cellReserve.spendableCells / 1e3, 1),
      burn_rate_per_hr: round(d.cellReserve.burnRatePerHour, 2),
      burndown_hours:   d.cellReserve.burndownHours != null ? round(d.cellReserve.burndownHours, 1) : null,
    } : null,
    slots: d.slots.map(s => ({
      slot:                s.slot,
      max_affordable:      s.maxAffordableSpeed,
      options:             s.options.map(o => ({
        speed:           o.speed,
        cost_per_day:    round(o.costPerDay, 0),
        net_cph:         round(o.netCellsPerHour, 2),
        affordable:      o.affordable,
      })),
    })),
    optimal:  combinationSummary(d.optimalCombination),
    farming:  combinationSummary(d.farmingCombination),
  });
}

function combinationSummary(c) {
  if (!c) return null;
  return {
    slots:           c.slots,
    cost_per_day:    round(c.totalCostPerDay, 0),
    net_cph:         round(c.netCellsPerHour, 2),
    affordable:      c.affordable,
  };
}

// ── Distillation: recent runs ─────────────────────────────────────────────────

function distillRecentRuns(runs, includeDiagnosis, diagnoses, tournamentConditionMap = {}) {
  return result(runs.map(r => {
    const durationHours = r.realTimeSeconds / 3600;
    const entry = {
      id:        r.id,
      date:      r.battleDate,
      type:      r.runType,
      tier:      r.tier,
      wave:      r.wave,
      version:   r.towerEra,
      coins_T:   round(r.coinsPerHour * durationHours / 1e12, 2),
      cph_T:     round(r.coinsPerHour / 1e12, 2),
      cells_K:   round(r.cellsEarned / 1e3, 2),
      killed_by: r.killedBy ?? null,
    };
    if (r.tournamentId != null && tournamentConditionMap[r.tournamentId]) {
      const t = tournamentConditionMap[r.tournamentId];
      entry.tournament = {
        id:         r.tournamentId,
        date:       t.date,
        league:     t.league,
        conditions: t.conditions,
      };
    }
    if (includeDiagnosis && diagnoses[r.id]) {
      const dx = diagnoses[r.id];
      entry.diagnosis = {
        primary_failure: dx.primaryFailure,
        confidence:      dx.confidence,
        explanation:     dx.explanation,
        swarm_kill_pct:  round(dx.swarmKillShare  * 100, 1),
        heavy_kill_pct:  round(dx.heavyKillShare  * 100, 1),
        block_eff_pct:   round(dx.blockEfficiency * 100, 1),
        observations:    (dx.observations ?? []).map(o => ({ type: o.type, detail: o.detail })),
      };
    }
    return entry;
  }));
}

// ── Distillation: run comparison ──────────────────────────────────────────────

function distillComparison(n1, n2, r1, r2, delta) {
  const br = h => h.sectionMap?.BATTLE_REPORT ?? {};
  const fmt = v => (v == null ? null : typeof v === 'object' && 'value' in v ? v.value : v);

  function summarise(h, runNumber) {
    const b = br(h);
    return {
      run: runNumber,
      date:     h.battleDate ?? null,
      type:     h.runType    ?? null,
      tier:     fmt(b.tier)  ?? null,
      wave:     fmt(b.wave)  ?? null,
      version:  h.towerEra   ?? null,
      killed_by: fmt(b.killedBy) ?? null,
      coins_per_hour: fmt(b.coinsPerHour) ?? null,
      cells_earned:   fmt(b.cellsEarned)  ?? null,
      real_time_s:    fmt(b.realTime)     ?? null,
      game_time_s:    fmt(b.gameTime)     ?? null,
    };
  }

  function deltaSections(d) {
    const out = {};
    const sm = d.sectionMap ?? {};
    for (const [key, section] of Object.entries(sm)) {
      if (!section || key === 'BATTLE_REPORT') continue;
      const fields = {};
      for (const [k, v] of Object.entries(section)) {
        if (k === 'sectionHeader') continue;
        const val = fmt(v);
        if (val != null && val !== 0) fields[k] = val;
      }
      if (Object.keys(fields).length) out[key] = fields;
    }
    return out;
  }

  const b = br(delta);
  return result({
    run1: summarise(r1, n1),
    run2: summarise(r2, n2),
    delta: {
      wave_diff:            fmt(b.wave)         ?? null,
      coins_per_hour_diff:  fmt(b.coinsPerHour) ?? null,
      cells_earned_diff:    fmt(b.cellsEarned)  ?? null,
      real_time_diff_s:     fmt(b.realTime)     ?? null,
      game_time_diff_s:     fmt(b.gameTime)     ?? null,
      killed_by:            fmt(b.killedBy)     ?? null,
      sections: deltaSections(delta),
    },
  });
}

// ── Distillation: tower state ─────────────────────────────────────────────────

function distillTowerState(d, sections, bans, summary, breakdown) {
  const out = {};

  if (sections.includes('uw')) {
    out.ultimate_weapons = Object.fromEntries(
      (d.ultimateWeapons ?? []).map(uw => {
        if (!uw.unlocked) return [uw.name, { unlocked: false }];
        const stats = Object.fromEntries(uw.stats.map(s => {
          const entry = {
            level:           s.currentLevel,
            max_level:       s.maxLevel,
            value:           s.currentValue,
            stones_invested: s.stonesInvested,
            stones_to_next:  s.stonesToNext  ?? null,
            stones_to_max:   s.stonesToMax,
          };
          if (s.targetLevel > 0) entry.target_level    = s.targetLevel;
          if (s.stonesToTarget > 0) entry.stones_to_target = s.stonesToTarget;
          return [s.label, entry];
        }));
        return [uw.name, {
          unlocked:         true,
          uw_plus_unlocked: uw.uwPlusUnlocked,
          stones_to_max:    uw.stats.reduce((sum, s) => sum + (s.stonesToMax ?? 0), 0),
          stats,
        }];
      })
    );
  }

  if (sections.includes('modules_active') || sections.includes('modules_all')) {
    const allModules = d.modules ?? [];
    if (sections.includes('modules_all')) {
      out.modules = distillModules(allModules, false);
    } else {
      // modules_active: only modules assigned to at least one preset
      const active = allModules.filter(m => m.presets && m.presets.length > 0);
      out.modules = distillModules(active, true);
    }
  }

  if (sections.includes('relic_summary') || sections.includes('relic_details')) {
    const { summary, owned } = distillRelics(d.relics ?? []);
    if (sections.includes('relic_summary'))  out.relic_summary = summary;
    if (sections.includes('relic_details'))  out.relics_owned  = owned;
  }

  if (sections.includes('effect_bans') && bans) {
    out.effect_bans = Object.fromEntries(
      bans.map(b => [b.moduleType, {
        max_bans:  b.maxBans,
        bans_used: b.banned.length,
        banned:    b.banned,
      }])
    );
  }

  if (sections.includes('stat_breakdown') && summary) {
    out.stat_breakdown = Object.fromEntries(
      Object.entries(summary).map(([key, s]) => {
        const entry = {};
        if (s.workshopValue     != null) entry.workshop      = s.workshopValue;
        if (s.workshopPlusValue != null) entry.workshop_plus = s.workshopPlusValue;
        if (s.relicBonus        != null) entry.relic_bonus   = s.relicBonus;
        if (s.moduleSubstatRarities?.length > 0) entry.module_substats = s.moduleSubstatRarities;
        return [key, entry];
      })
    );
  }

  if (sections.includes('stat_breakdown_detailed') && breakdown) {
    out.stat_breakdown_detailed = Object.fromEntries(
      Object.entries(breakdown).map(([key, bd]) => {
        const entry = {};
        if (bd.workshopItems.length > 0) {
          const regular = bd.workshopItems.filter(w => !w.isPlus);
          const plus    = bd.workshopItems.filter(w =>  w.isPlus);
          if (regular.length > 0) entry.workshop      = regular.map(w => ({ name: w.name, level: w.level, max: w.maxLevel }));
          if (plus.length    > 0) entry.workshop_plus = plus.map(w =>    ({ name: w.name, level: w.level, max: w.maxLevel }));
        }
        if (bd.relics.length > 0)
          entry.relics = bd.relics.map(r => ({ name: r.name, rarity: r.rarity, bonus: r.bonus }));
        if (bd.moduleSubstats.length > 0)
          entry.module_substats = bd.moduleSubstats.map(m => ({ module: m.moduleName, rarity: m.substatRarity }));
        return [key, entry];
      })
    );
  }

  return result(out);
}

function distillModules(moduleList, compactSubstats) {
  const byType = {};
  for (const m of moduleList) {
    if (!byType[m.type]) byType[m.type] = [];
    const substats = compactSubstats
      ? m.substats.map(s => ({ key: s.key, rarity: s.rarity }))
      : m.substats.map(s => ({ slot: s.slot, key: s.key, rarity: s.rarity, locked: s.locked }));
    const entry = {
      id:              m.id,
      code:            m.code,
      name:            m.name,
      owned:           m.owned,
      rarity:          m.rarity,
      stars:           m.stars,
      level:           m.level,
      ability_values:  m.abilityValues,
      substats,
      copies:          m.copies,
      shattered_epics: m.shatteredEpics,
      presets:         m.presets.map(p => ({ preset: p.preset, slot: p.slot })),
    };
    byType[m.type].push(entry);
  }
  return byType;
}

function distillRelics(relicList) {
  const owned       = relicList.filter(r => r.owned);
  const totalByType = {};
  const ownedByType = {};
  for (const r of relicList) {
    totalByType[r.type] = (totalByType[r.type] ?? 0) + 1;
  }
  for (const r of owned) {
    if (!ownedByType[r.type]) ownedByType[r.type] = [];
    ownedByType[r.type].push({
      name:        r.name,
      rarity:      r.rarity,
      bonus_stat:  r.bonusStat,
      bonus_value: r.bonusValue,
    });
  }
  const summary = Object.keys(totalByType).sort().map(type => ({
    type,
    owned: ownedByType[type]?.length ?? 0,
    total: totalByType[type],
  }));
  return { summary, owned: ownedByType };
}

// ── Distillation: lab state ───────────────────────────────────────────────────

function distillLabState(d, hideMaxed, category) {
  const m = d.multipliers;
  let labs = d.labs ?? [];

  if (hideMaxed) labs = labs.filter(l => l.currentLevel < l.maxLevel);
  if (category)  labs = labs.filter(l => l.category === category);

  const byCategory = {};
  for (const l of labs) {
    if (!byCategory[l.category]) byCategory[l.category] = [];
    const entry = { name: l.name, level: l.currentLevel, max: l.maxLevel };
    if (l.targetLevel != null) entry.target = l.targetLevel;
    byCategory[l.category].push(entry);
  }

  return result({
    speed_multiplier: round(m.speedMult, 3),
    coin_discount:    round(1 - m.costMult, 3),
    labs:             byCategory,
  });
}

// ── Distillation: workshop state ──────────────────────────────────────────────

function distillWorkshopState({ items, progress, discounts, spend, presets }, sections, categoryFilter) {
  const out = {};

  if (sections.includes('items') && items) {
    // Build set of locked plus-item IDs from the progress list
    const lockedPlusIds = new Set((progress ?? []).map(p => p.itemId));

    let filtered = items;
    if (categoryFilter) filtered = filtered.filter(it => it.category === categoryFilter);

    const byCategory = {};
    for (const it of filtered) {
      if (!byCategory[it.category]) byCategory[it.category] = { regular: [], plus: [] };
      const unlocked = it.isPlus
        ? !lockedPlusIds.has(it.id)
        : (!it.unlockGroupId || it.unlockGroupPurchased);
      const entry = {
        name:     it.name,
        is_plus:  it.isPlus,
        level:    it.currentLevel,
        max:      it.maxLevel,
        unlocked,
      };
      if (it.isPlus) {
        byCategory[it.category].plus.push(entry);
      } else {
        byCategory[it.category].regular.push(entry);
      }
    }
    out.items = byCategory;
  }

  if (sections.includes('unlock_progress') && progress) {
    let filtered = progress;
    if (categoryFilter) filtered = filtered.filter(p => p.category === categoryFilter);
    out.unlock_progress = filtered.map(p => ({
      name:          p.itemName,
      category:      p.category,
      lab_done:      p.labCompleted,
      spent_T:       round(p.spent      / 1e12, 3),
      threshold_T:   round(p.threshold  / 1e12, 3),
      remaining_T:   round(p.remaining  / 1e12, 3),
    }));
  }

  if (sections.includes('discounts') && discounts) {
    out.discounts = {
      attack:       round(1 - discounts.attackCostMult,     3),
      defense:      round(1 - discounts.defenseCostMult,    3),
      utility:      round(1 - discounts.utilityCostMult,    3),
      plus_attack:  round(1 - discounts.plusAttackCostMult, 3),
      plus_defense: round(1 - discounts.plusDefenseCostMult,3),
      plus_utility: round(1 - discounts.plusUtilityCostMult,3),
    };
  }

  if (sections.includes('spend') && spend) {
    out.plus_spend = Object.fromEntries(
      spend.map(s => [s.category, round(s.totalSpent / 1e12, 3)])
    );
  }

  if (sections.includes('presets') && presets) {
    out.presets = presets.map(p => ({
      id:      p.id,
      is_plus: p.isPlus,
      slot:    p.slot,
      name:    p.name,
      items:   (p.items ?? []).map(it => ({
        name:         it.itemName,
        target_level: it.targetLevel,
      })),
    }));
  }

  return result(out);
}

// ── Distillation: cards state ─────────────────────────────────────────────────

// Copies required to advance TO each star level (index = target star, 1-based; index 1 = 0).
const COPIES_TO_REACH_STAR = [0, 0, 1, 2, 3, 4, 6, 8];

function distillCardsState({ cards, slots, presets }, sections) {
  const out = {};

  if (sections.includes('cards') && cards) {
    out.cards = cards.map(c => ({
      name:                c.name,
      rarity:              c.rarity,
      star_level:          c.starLevel,
      copies_owned:        c.copiesOwned,
      copies_toward_next:  c.starLevel < 7
        ? Math.min(c.copiesOwned, COPIES_TO_REACH_STAR[c.starLevel + 1])
        : null,
      mastery_level: c.masteryLevel,
      mastery_max:   c.masteryLabLevel,
    }));
  }

  if (sections.includes('slots') && slots) {
    const owned    = slots.filter(s => s.owned).map(s => s.slotNumber);
    const unlocked = slots.filter(s => !s.owned).map(s => ({
      slot:     s.slotNumber,
      cost:     s.unlockCost,
      currency: s.unlockCurrency,
    }));
    out.slots = { owned_count: owned.length, owned, locked: unlocked };
  }

  if (sections.includes('presets') && presets) {
    out.presets = presets.map(p => ({
      id:          p.id,
      slot:        p.slot,
      name:        p.name,
      assignments: (p.assignments ?? []).map(a => ({
        slot:      a.slotNumber,
        card_name: a.cardName,
      })),
    }));
  }

  return result(out);
}

// ── Distillation: card details ────────────────────────────────────────────────

function distillCardDetails(d) {
  return {
    name:         d.name,
    rarity:       d.rarity,
    description:  d.description,
    value_unit:   d.valueUnit,
    milestone_unlock: d.milestoneUnlockTier != null
      ? { tier: d.milestoneUnlockTier, wave: d.milestoneUnlockWave }
      : null,
    star_level:    d.starLevel,
    current_value: d.currentValue,
    stats_by_level: d.statsByLevel,
    copies_owned:              d.copiesOwned,
    copies_for_next_star:      d.copiesForNextStar,
    copies_remaining_for_max:  d.copiesRemainingForMax,
    gem_cost_to_max:           d.gemCostToMax,
    mastery: {
      description:           d.mastery.description,
      value_unit:            d.mastery.valueUnit,
      stone_cost_per_level:  d.mastery.stoneCostPerLevel,
      is_unlocked:           d.mastery.isUnlocked,
      current_level:         d.mastery.currentLevel,
      max_level:             d.mastery.maxLevel,
      current_value:         d.mastery.currentValue,
      values_by_level:       d.mastery.valuesByLevel,
      stones_remaining_to_max: d.mastery.stonesRemainingToMax,
    },
    presets_equipped: d.presetsEquipped.map(p => ({
      preset_id:   p.presetId,
      preset_slot: p.presetSlot,
      preset_name: p.presetName,
      card_slot:   p.cardSlot,
    })),
  };
}

// ── Distillation: bots state ──────────────────────────────────────────────────

function distillBotsState({ bots, presets }, sections) {
  const out = {};

  if (sections.includes('bots') && bots) {
    out.bots = bots.map(b => ({
      name:              b.name,
      unlocked:          b.unlocked,
      bot_plus_unlocked: b.botPlusUnlocked,
      unlock_order:      b.unlockOrder ?? null,
      stats: b.stats.map(s => ({
        label:         s.label,
        is_plus:       s.isBotPlus,
        level:         s.currentLevel,
        max:           s.maxLevel,
      })),
    }));
  }

  if (sections.includes('presets') && presets) {
    out.presets = presets.map(p => ({
      id:   p.id,
      slot: p.slot,
      name: p.name,
      unlocks: (p.unlocks ?? [])
        .filter(u => u.unlocked || u.botPlusUnlocked)
        .map(u => ({ bot_id: u.botId, bot_plus: u.botPlusUnlocked })),
      stat_targets: (p.statLevels ?? []).map(s => ({
        stat_id:      s.botStatId,
        target_level: s.targetLevel,
      })),
    }));
  }

  return result(out);
}

// ── Distillation: guardian state ──────────────────────────────────────────────

function distillGuardianState({ guardianData, presets }, sections) {
  const out = {};

  if (guardianData) {
    if (sections.includes('chips')) {
      out.guardian_unlocked = guardianData.unlocked;
      out.chips = (guardianData.chips ?? []).map(c => ({
        name:     c.name,
        source:   c.source,
        season:   c.unlockSeason ?? null,
        acquired: c.acquired,
        stats: c.stats.map(s => ({
          label: s.label,
          level: s.currentLevel,
          max:   s.maxLevel,
        })),
      }));
    }

    if (sections.includes('slots')) {
      out.slots = (guardianData.slots ?? []).map(s => ({
        slot:          s.slotNumber,
        unlocked:      s.unlocked,
        unlock_tokens: s.unlockCostTokens ?? null,
      }));
    }
  }

  if (sections.includes('presets') && presets) {
    out.presets = presets.map(p => ({
      id:   p.id,
      slot: p.slot,
      name: p.name,
      chips: (p.chips ?? [])
        .filter(c => c.active)
        .map(c => ({ chip_id: c.chipId })),
      stat_targets: (p.statLevels ?? []).map(s => ({
        stat_id:      s.chipStatId,
        target_level: s.targetLevel,
      })),
    }));
  }

  return result(out);
}

// ── Distillation: tournament history ─────────────────────────────────────────

function distillTournamentHistory({ tournaments, conditions }, sections, leagueFilter) {
  const out = {};

  if (sections.includes('tournaments') && tournaments) {
    let list = tournaments;
    if (leagueFilter) list = list.filter(t => t.league === leagueFilter);
    out.tournaments = list.map(t => ({
      date:       t.date,
      league:     t.league,
      conditions: (t.conditions ?? []).map(c => c.acronym),
    }));
  }

  if (sections.includes('conditions') && conditions) {
    const byCategory = {};
    for (const c of conditions) {
      if (!byCategory[c.category]) byCategory[c.category] = [];
      byCategory[c.category].push({ id: c.id, name: c.name, acronym: c.acronym });
    }
    out.conditions = byCategory;
  }

  return result(out);
}

// ── Distillation: tier PBs ────────────────────────────────────────────────────

function distillTierPbs(d) {
  return result({
    echo_levels: d.echoLevels,
    tournament_boost: {
      attack:  String(d.tournamentBoost.attack),
      defense: String(d.tournamentBoost.defense),
      utility: String(d.tournamentBoost.utility),
      uw:      String(d.tournamentBoost.uw),
    },
    tiers: (d.tiers ?? []).map(t => ({
      tier:           t.tier,
      wave:           t.wave,
      attack_waves:   t.attackWaves,
      defense_waves:  t.defenseWaves,
      utility_waves:  t.utilityWaves,
      uw_waves:       t.uwWaves,
      attack_boost:   String(t.attackBoost),
      defense_boost:  String(t.defenseBoost),
      utility_boost:  String(t.utilityBoost),
      uw_boost:       String(t.uwBoost),
    })),
  });
}

// ── Distillation: version history ─────────────────────────────────────────────

function distillVersionHistory(versions, sections, limit) {
  const limited = versions.slice(0, limit);
  const includeChanges = sections.includes('changes');

  return result(limited.map(v => {
    const entry = {
      version: v.version,
      type:    v.type,
      summary: v.summary,
    };
    if (includeChanges) {
      entry.changes = (v.changes ?? []).map(c => ({
        category: c.category,
        entity:   c.entityName,
        from:     c.oldValue,
        to:       c.newValue,
        notes:    c.notes ?? null,
      }));
    }
    return entry;
  }));
}

// ── Distillation: pending version changes ─────────────────────────────────────

function distillPendingChanges(changes) {
  if (changes.length === 0) {
    return result({ pendingCount: 0, changes: [] });
  }
  return result({
    pendingCount: changes.length,
    changes: changes.map(c => ({
      category:  c.category,
      entity:    c.entityName,
      from:      c.oldValue,
      to:        c.newValue,
      notes:     c.notes ?? null,
      recordedAt: c.createdAt,
    })),
  });
}

// ── Distillation: cosmetics ───────────────────────────────────────────────────

function distillCosmetics(items) {
  const byCategory = {};
  for (const it of items) {
    if (!byCategory[it.categoryId]) {
      byCategory[it.categoryId] = {
        name:          it.categoryName,
        bonus_per_item: it.bonusPerItem,
        owned:         0,
        total:         0,
        items:         [],
      };
    }
    const cat = byCategory[it.categoryId];
    cat.total++;
    if (it.owned) {
      cat.owned++;
      cat.items.push(it.name);
    }
  }
  return result(byCategory);
}

// ── Distillation: lab slots ───────────────────────────────────────────────────

function distillLabSlots(slots) {
  return result(slots.map(s => {
    const entry = {
      slot:          s.slotNumber,
      speed_mult:    s.cellSpeedMult,
      queue_coins:   Math.round(s.totalCoins),
      queue_days:    round(s.totalDurationSeconds / 86400, 1),
      coins_per_day: s.coinsPerDay != null ? Math.round(s.coinsPerDay) : null,
      plans: (s.plans ?? []).map(p => ({
        lab:    p.labName,
        from:   p.startLevel,
        to:     p.targetLevel,
        coins:  Math.round(p.coinsTotalResearch),
        days:   round(p.durationSeconds / 86400, 1),
      })),
    };
    return entry;
  }));
}

// ── Distillation: lab plan ────────────────────────────────────────────────────

function distillLabPlan(slots) {
  return result(slots.map(s => {
    const plans = s.plans ?? [];
    if (plans.length === 0) {
      return { slot: s.slotNumber, status: 'idle' };
    }
    const [current, next, ...rest] = plans;
    const entry = {
      slot:    s.slotNumber,
      status:  'active',
      current: {
        lab:     current.labName,
        from:    current.startLevel,
        to:      current.targetLevel,
        coins:   Math.round(current.coinsTotalResearch),
        days:    round(current.durationSeconds / 86400, 1),
      },
    };
    if (next) {
      entry.next = { lab: next.labName, from: next.startLevel, to: next.targetLevel };
    }
    if (rest.length > 0) {
      entry.queued = rest.map(p => ({ lab: p.labName, from: p.startLevel, to: p.targetLevel }));
    }
    return entry;
  }));
}

// ── Distillation: lab catalog ─────────────────────────────────────────────────

function distillLabCatalog(labs) {
  const byCategory = {};
  for (const l of labs) {
    if (!byCategory[l.category]) byCategory[l.category] = [];
    const unlock = parseUnlock(l.unlock);
    const entry = {
      id:          l.id,
      name:        l.name,
      level:       l.currentLevel,
      max:         l.maxLevel,
      description: l.description ?? null,
      unlock,
    };
    if (l.targetLevel != null) entry.target = l.targetLevel;
    byCategory[l.category].push(entry);
  }
  return result(byCategory);
}

function parseUnlock(unlock) {
  if (!unlock) return null;
  const m = unlock.match(/T(\d+),W(\d+)/);
  return m ? { tier: parseInt(m[1]), wave: parseInt(m[2]) } : unlock;
}

// ── Distillation: perk settings ──────────────────────────────────────────────

function distillPerkSettings(d) {
  return result({
    firstChoice: d.firstChoice ?? null,
    bans:        d.bans ?? [],
    ranking:     d.ranking ?? [],
  });
}

// ── Distillation: perk wave cost ─────────────────────────────────────────────

const PERK_BASES = [200, 250, 300, 350];

function distillPerkWaveCost(labState, pwrPicks, targetWave) {
  const labs = labState.labs ?? [];
  const wavesRequiredLevel = labs.find(l => l.name === 'Waves Required')?.currentLevel ?? 0;
  const spbLevel           = labs.find(l => l.name === 'Standard Perks Bonus')?.currentLevel ?? 0;

  const reductionFactor = 1 - pwrPicks * 0.20 * (1 + spbLevel * 0.01);

  const breakpoints = PERK_BASES.map(base => ({
    base,
    waves: Math.floor((base - wavesRequiredLevel) * reductionFactor),
  }));

  const out = {
    inputs: {
      waves_required_level: wavesRequiredLevel,
      spb_level:            spbLevel,
      pwr_picks:            pwrPicks,
    },
    breakpoints,
  };

  if (targetWave != null) {
    const ranges = [
      { cost: breakpoints[0].waves, count: 20 },
      { cost: breakpoints[1].waves, count: 10 },
      { cost: breakpoints[2].waves, count: 10 },
      { cost: breakpoints[3].waves, count: Infinity },
    ];
    let remaining = targetWave;
    let perks = 0;
    for (const { cost, count } of ranges) {
      if (cost <= 0) break;
      const affordable = Math.min(count, Math.floor(remaining / cost));
      perks += affordable;
      remaining -= affordable * cost;
      if (affordable < count) break;
    }
    out.perks_reachable = perks;
  }

  return result(out);
}

// ── Distillation: lab costs ───────────────────────────────────────────────────

function distillLabCosts(costs) {
  return result(costs.map(c => ({
    level:    c.level,
    coins_T:  c.coinCost != null ? round(c.coinCost / 1e12, 3) : null,
    days:     c.durationSeconds != null ? round(c.durationSeconds / 86400, 2) : null,
  })));
}

// ── Distillation: shortest labs to max ───────────────────────────────────────

// Matches the game's own scale suffixes (K/M/B/T/q/Q/...) so small costs never
// silently round to "0" the way a fixed coins_T (÷1e12) field would.
const COIN_SCALE_SUFFIXES = [
  [1e33, 'd'], [1e30, 'N'], [1e27, 'O'], [1e24, 'S'], [1e21, 's'],
  [1e18, 'Q'], [1e15, 'q'], [1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K'],
];

function formatCoins(n) {
  if (!n) return '0';
  for (const [scale, suffix] of COIN_SCALE_SUFFIXES) {
    if (n >= scale) return `${round(n / scale, 3)}${suffix}`;
  }
  return String(Math.round(n));
}

function distillShortestLabsToMax(costMap, allLabs) {
  const labById = new Map(allLabs.map(l => [String(l.id), l]));
  const labs = Object.entries(costMap)
    .map(([id, c]) => {
      const lab = labById.get(id);
      return {
        name:     lab?.name     ?? `Lab ${id}`,
        category: lab?.category ?? null,
        to_level: c.level,
        days:     round(c.durationSeconds / 86400, 2),
        coins:    formatCoins(c.coinCost),
      };
    })
    .sort((a, b) => a.days - b.days);

  return result({ count: labs.length, labs });
}

// ── Distillation: module leveling cost ───────────────────────────────────────

function distillModuleLevelingCost(d, labState) {
  const labs = labState?.labs ?? [];
  const shardDiscountLevel = labs.find(l => l.name === 'Module Shards Cost')?.currentLevel ?? 0;
  const coinDiscountLevel  = labs.find(l => l.name === 'Module Coin Cost')?.currentLevel  ?? 0;
  const shardMult = 1 - shardDiscountLevel * 0.01;
  const coinMult  = 1 - coinDiscountLevel  * 0.01;
  return result({
    from_level:            d.fromLevel,
    to_level:              d.toLevel,
    total_shards:          Math.ceil(d.totalShards * shardMult),
    total_coins:           Math.ceil(d.totalCoins  * coinMult),
    shard_discount_pct:    shardDiscountLevel,
    coin_discount_pct:     coinDiscountLevel,
  });
}

// ── Distillation: GT income projection ───────────────────────────────────────

function distillGtIncomeProjection(d, inputs) {
  const fmt = n => round(n / 1e9, 3);  // express in billions (T-coins × 1e-3)

  return result({
    inputs,
    projected_income_B:      fmt(d.projectedIncome),
    perm_gt_income_B:        fmt(d.permGtIncome),
    activations_per_run:     round(d.activationsPerRun, 1),
    kills_per_activation:    round(d.killsPerActivation, 0),
    gt_plus_bonus_pct:       round(d.bonusFraction * 100, 1),
    marginal_duration_value_B: fmt(d.marginalDurationValue),
    comparison_table: d.comparisonTable.map(row => ({
      duration_sec:      row.durationSec,
      income_B:          fmt(row.projectedIncome),
      gain_vs_current_B: fmt(row.incomeGainVsCurrent),
      is_current:        row.isCurrent,
    })),
  });
}

// ── Distillation: SL coverage efficiency ─────────────────────────────────────

function distillSlCoverageEfficiency(d) {
  const out = {
    angle_level:        d.angleLevel,
    quantity_level:     d.quantityLevel,
    angle_degrees:      d.angleDegrees,
    quantity_beams:     d.quantityBeams,
    effective_coverage: round(d.effectiveCoverage, 1),
  };

  if (d.angleNextStoneCost != null) {
    out.angle_next = {
      coverage_gain:      round(d.angleNextCoverageGain, 1),
      stone_cost:         d.angleNextStoneCost,
      coverage_per_stone: round(d.angleCoveragePerStone, 4),
    };
  } else {
    out.angle_next = 'maxed';
  }

  if (d.quantityNextStoneCost != null) {
    out.quantity_next = {
      coverage_gain:      round(d.quantityNextCoverageGain, 1),
      stone_cost:         d.quantityNextStoneCost,
      coverage_per_stone: round(d.quantityCoveragePerStone, 4),
    };
  } else {
    out.quantity_next = 'maxed';
  }

  out.recommendation = d.recommendation;
  return result(out);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function result(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function round(n, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
