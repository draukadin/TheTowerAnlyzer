package com.pphi.tower.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.*;

@Repository
public class StatBreakdownRepository {

    private final JdbcTemplate jdbc;

    public StatBreakdownRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ── DTOs ──────────────────────────────────────────────────────────────────

    public record WorkshopContrib(String name, int level, int maxLevel, boolean isPlus) {}

    public record RelicContrib(String name, String rarity, double bonus) {}

    public record ModuleSubstatContrib(String moduleName, String substatRarity) {}

    public record StatBreakdown(
            String statKey,
            List<WorkshopContrib> workshopItems,
            List<RelicContrib> relics,
            List<ModuleSubstatContrib> moduleSubstats
    ) {}

    /** Aggregate view: effective value at current level for each contributor type. */
    public record StatSummary(
            String statKey,
            Double workshopValue,
            Double workshopPlusValue,
            Double relicBonus,
            List<String> moduleSubstatRarities,
            Double moduleSubstatValue
    ) {}

    // ── Query ─────────────────────────────────────────────────────────────────

    public Map<String, StatBreakdown> getBreakdown() {
        // 1. Workshop items (regular + plus) with current levels
        List<Map<String, Object>> wsRows = jdbc.queryForList("""
                SELECT wisk.stat_key, wi.name AS item_name, wi.is_plus,
                       wi.max_level, COALESCE(wis.current_level, 0) AS current_level
                FROM workshop_item_stat_key wisk
                JOIN workshop_item wi ON wi.id = wisk.workshop_item_id
                LEFT JOIN workshop_item_state wis ON wis.workshop_item_id = wi.id
                ORDER BY wisk.stat_key, wi.is_plus, wi.sort_order
                """);

        // 2. Owned relics that have a stat_key
        List<Map<String, Object>> relicRows = jdbc.queryForList("""
                SELECT r.stat_key, r.name, r.rarity, r.bonus_value
                FROM relic r
                JOIN relic_player_state rps ON rps.relic_id = r.id
                WHERE rps.owned = 1 AND r.stat_key IS NOT NULL
                ORDER BY r.stat_key, r.rarity, r.name
                """);

        // 3. Module substats from modules assigned to at least one preset
        List<Map<String, Object>> substatRows = jdbc.queryForList("""
                SELECT mps.substat_key AS stat_key, md.name AS module_name, mps.substat_rarity
                FROM module_player_substat mps
                JOIN module_def md ON md.id = mps.module_def_id
                WHERE EXISTS (
                    SELECT 1 FROM module_preset_assignment mpa
                    WHERE mpa.module_def_id = mps.module_def_id
                )
                ORDER BY mps.substat_key, md.name
                """);

        // Assemble
        Map<String, List<WorkshopContrib>> wsMap = new LinkedHashMap<>();
        for (Map<String, Object> row : wsRows) {
            String key = (String) row.get("stat_key");
            wsMap.computeIfAbsent(key, k -> new ArrayList<>()).add(new WorkshopContrib(
                    (String) row.get("item_name"),
                    ((Number) row.get("current_level")).intValue(),
                    ((Number) row.get("max_level")).intValue(),
                    ((Number) row.get("is_plus")).intValue() == 1
            ));
        }

        Map<String, List<RelicContrib>> relicMap = new LinkedHashMap<>();
        for (Map<String, Object> row : relicRows) {
            String key = (String) row.get("stat_key");
            relicMap.computeIfAbsent(key, k -> new ArrayList<>()).add(new RelicContrib(
                    (String) row.get("name"),
                    (String) row.get("rarity"),
                    ((Number) row.get("bonus_value")).doubleValue()
            ));
        }

        Map<String, List<ModuleSubstatContrib>> substatMap = new LinkedHashMap<>();
        for (Map<String, Object> row : substatRows) {
            String key = (String) row.get("stat_key");
            substatMap.computeIfAbsent(key, k -> new ArrayList<>()).add(new ModuleSubstatContrib(
                    (String) row.get("module_name"),
                    (String) row.get("substat_rarity")
            ));
        }

        Set<String> allKeys = new LinkedHashSet<>();
        allKeys.addAll(wsMap.keySet());
        allKeys.addAll(relicMap.keySet());
        allKeys.addAll(substatMap.keySet());

        Map<String, StatBreakdown> result = new LinkedHashMap<>();
        for (String key : allKeys) {
            result.put(key, new StatBreakdown(
                    key,
                    wsMap.getOrDefault(key, List.of()),
                    relicMap.getOrDefault(key, List.of()),
                    substatMap.getOrDefault(key, List.of())
            ));
        }
        return result;
    }

    // ── Summary (aggregate) ───────────────────────────────────────────────────

    public Map<String, StatSummary> getSummary() {
        // Workshop value at current level (regular and plus, separately)
        List<Map<String, Object>> wsRows = jdbc.queryForList("""
                SELECT wisk.stat_key, wi.is_plus,
                       COALESCE(wilv.value, 0) AS current_value
                FROM workshop_item_stat_key wisk
                JOIN workshop_item wi ON wi.id = wisk.workshop_item_id
                LEFT JOIN workshop_item_state wis ON wis.workshop_item_id = wi.id
                LEFT JOIN workshop_item_level_value wilv
                    ON wilv.workshop_item_id = wi.id
                    AND wilv.level = COALESCE(wis.current_level, 0)
                ORDER BY wisk.stat_key, wi.is_plus, wi.sort_order
                """);

        // Sum relic bonus_value per stat_key (owned relics only)
        List<Map<String, Object>> relicRows = jdbc.queryForList("""
                SELECT r.stat_key, SUM(r.bonus_value) AS total_bonus
                FROM relic r
                JOIN relic_player_state rps ON rps.relic_id = r.id
                WHERE rps.owned = 1 AND r.stat_key IS NOT NULL
                GROUP BY r.stat_key
                """);

        // Module substats rarities (+ computed value where a level curve is known) from modules
        // assigned to at least one preset. Only "coins_kill_bonus" has a value curve
        // (module_coin_bonus_level_value); it's keyed by the owning module's own (rarity, level)
        // from module_player_state, not the substat's independently-tracked substat_rarity.
        List<Map<String, Object>> substatRows = jdbc.queryForList("""
                SELECT mps.substat_key AS stat_key, mps.substat_rarity,
                       mcblv.value AS substat_value
                FROM module_player_substat mps
                LEFT JOIN module_player_state mpst ON mpst.module_def_id = mps.module_def_id
                LEFT JOIN module_coin_bonus_level_value mcblv
                    ON mps.substat_key = 'coins_kill_bonus'
                    AND mcblv.module_rarity = mpst.rarity
                    AND mcblv.level = COALESCE(mpst.level, 0)
                WHERE EXISTS (
                    SELECT 1 FROM module_preset_assignment mpa
                    WHERE mpa.module_def_id = mps.module_def_id
                )
                ORDER BY mps.substat_key
                """);

        // Aggregate workshop values: sum per (stat_key, is_plus)
        Map<String, Double> wsRegular = new LinkedHashMap<>();
        Map<String, Double> wsPlus    = new LinkedHashMap<>();
        for (Map<String, Object> row : wsRows) {
            String key   = (String) row.get("stat_key");
            boolean plus = ((Number) row.get("is_plus")).intValue() == 1;
            double val   = ((Number) row.get("current_value")).doubleValue();
            if (plus) wsPlus.merge(key, val, Double::sum);
            else      wsRegular.merge(key, val, Double::sum);
        }

        Map<String, Double> relicMap = new LinkedHashMap<>();
        for (Map<String, Object> row : relicRows) {
            relicMap.put((String) row.get("stat_key"), ((Number) row.get("total_bonus")).doubleValue());
        }

        Map<String, List<String>> substatMap = new LinkedHashMap<>();
        Map<String, Double> substatValueMap = new LinkedHashMap<>();
        for (Map<String, Object> row : substatRows) {
            String key = (String) row.get("stat_key");
            substatMap.computeIfAbsent(key, k -> new ArrayList<>()).add((String) row.get("substat_rarity"));
            Object value = row.get("substat_value");
            if (value == null) continue;
            substatValueMap.merge(key, ((Number) value).doubleValue(), Double::sum);
        }

        Set<String> allKeys = new LinkedHashSet<>();
        allKeys.addAll(wsRegular.keySet());
        allKeys.addAll(wsPlus.keySet());
        allKeys.addAll(relicMap.keySet());
        allKeys.addAll(substatMap.keySet());

        Map<String, StatSummary> result = new LinkedHashMap<>();
        for (String key : allKeys) {
            result.put(key, new StatSummary(
                    key,
                    wsRegular.get(key),
                    wsPlus.get(key),
                    relicMap.get(key),
                    substatMap.getOrDefault(key, List.of()),
                    substatValueMap.get(key)
            ));
        }
        return result;
    }

    /**
     * Sum of {@code module_coin_bonus_level_value} for the given stat key, scoped to modules
     * assigned to the given preset (Primary and Assist slots both count — Assist modules contribute
     * their own sub-stats in-game too). Unlike {@link #getSummary()}, which aggregates a module's
     * substat across every preset it's ever been assigned to, this reflects a single specific
     * loadout (e.g. "Farming") — used by {@link com.pphi.tower.service.CoinBonusService} so the
     * Modules factor doesn't sum contributions from unrelated Tournament/Testing modules.
     */
    public Double getModuleSubstatValueForPreset(String statKey, String modulePreset) {
        // The growth curve is keyed by the owning module's own rarity/level (module_player_state),
        // not the substat's independently-tracked substat_rarity — a substat's roll rarity only
        // gates which slot it occupies, but this stat's value scales with the module itself.
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT mcblv.value AS substat_value
                FROM module_player_substat mps
                LEFT JOIN module_player_state mpst ON mpst.module_def_id = mps.module_def_id
                LEFT JOIN module_coin_bonus_level_value mcblv
                    ON mcblv.module_rarity = mpst.rarity
                    AND mcblv.level = COALESCE(mpst.level, 0)
                WHERE mps.substat_key = ?
                  AND EXISTS (
                      SELECT 1 FROM module_preset_assignment mpa
                      WHERE mpa.module_def_id = mps.module_def_id AND mpa.preset = ?
                  )
                """, statKey, modulePreset);

        Double sum = null;
        for (Map<String, Object> row : rows) {
            Object value = row.get("substat_value");
            if (value == null) continue;
            sum = (sum == null ? 0.0 : sum) + ((Number) value).doubleValue();
        }
        return sum;
    }
}
