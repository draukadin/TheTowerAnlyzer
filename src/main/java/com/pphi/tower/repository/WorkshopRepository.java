package com.pphi.tower.repository;

import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;

@Repository
public class WorkshopRepository {

    private final JdbcTemplate                  jdbc;
    private final PendingVersionChangeRepository pendingRepo;

    public WorkshopRepository(JdbcTemplate jdbc, PendingVersionChangeRepository pendingRepo) {
        this.jdbc        = jdbc;
        this.pendingRepo = pendingRepo;
    }

    // ── Records ───────────────────────────────────────────────────────────────

    public record WorkshopItem(
            long id,
            String name,
            String category,
            boolean isPlus,
            int sortOrder,
            int maxLevel,
            int currentLevel,
            Integer targetLevel,
            // Workshop (non-plus) unlock
            Long unlockGroupId,
            Double unlockGroupCost,
            boolean unlockGroupPurchased,
            // Workshop+ unlock phase 1 (lab)
            String plusUnlockLabName,
            // Workshop+ unlock phase 2 (cumulative spend threshold within category)
            Double plusUnlockCumulativeSpend
    ) {}

    public record WorkshopLevelCost(int level, double baseCost) {}

    /** Total coins spent on Workshop+ items within one category by the player so far. */
    public record PlusCategorySpend(String category, double totalSpent) {}

    /**
     * For each Workshop+ item that is not yet unlocked, shows how much more the player
     * must spend in that category before it becomes available.
     */
    public record PlusUnlockProgress(
            long itemId,
            String itemName,
            String category,
            int sortOrder,
            double threshold,
            double spent,
            double remaining,
            boolean hasLabRequirement,
            boolean labCompleted
    ) {}

    public record WorkshopDiscounts(
            double attackCostMult,
            double defenseCostMult,
            double utilityCostMult,
            double plusAttackCostMult,
            double plusDefenseCostMult,
            double plusUtilityCostMult
    ) {}

    // ── Queries ───────────────────────────────────────────────────────────────

    /** All Workshop and Workshop+ items with their current player state. */
    @Cacheable("workshop")
    public List<WorkshopItem> getAll() {
        return jdbc.query("""
                SELECT
                    wi.id, wi.name, wc.name AS category, wi.is_plus,
                    wi.sort_order, wi.max_level,
                    COALESCE(wis.current_level, 0) AS current_level,
                    wis.target_level,
                    wi.unlock_group_id,
                    wug.unlock_cost AS unlock_group_cost,
                    COALESCE(wugs.is_purchased, 0) AS unlock_group_purchased,
                    wi.plus_unlock_lab_name,
                    wi.plus_unlock_cumulative_spend
                FROM workshop_item wi
                JOIN workshop_category wc ON wc.id = wi.category_id
                LEFT JOIN workshop_item_state wis ON wis.workshop_item_id = wi.id
                LEFT JOIN workshop_unlock_group wug ON wug.id = wi.unlock_group_id
                LEFT JOIN workshop_unlock_group_state wugs ON wugs.unlock_group_id = wi.unlock_group_id
                ORDER BY wi.is_plus, wc.id, wi.sort_order
                """,
                (rs, i) -> new WorkshopItem(
                        rs.getLong("id"),
                        rs.getString("name"),
                        rs.getString("category"),
                        rs.getInt("is_plus") == 1,
                        rs.getInt("sort_order"),
                        rs.getInt("max_level"),
                        rs.getInt("current_level"),
                        rs.getObject("target_level") != null ? rs.getInt("target_level") : null,
                        rs.getObject("unlock_group_id") != null ? rs.getLong("unlock_group_id") : null,
                        rs.getObject("unlock_group_cost") != null ? rs.getDouble("unlock_group_cost") : null,
                        rs.getInt("unlock_group_purchased") == 1,
                        rs.getString("plus_unlock_lab_name"),
                        rs.getObject("plus_unlock_cumulative_spend") != null
                                ? rs.getDouble("plus_unlock_cumulative_spend") : null
                ));
    }

    /** Set (or clear) the target level for a Workshop item. */
    @CacheEvict(value = "workshop", allEntries = true)
    public void updateTargetLevel(long workshopItemId, Integer targetLevel) {
        jdbc.update("""
                INSERT INTO workshop_item_state (workshop_item_id, target_level) VALUES (?,?)
                ON CONFLICT(workshop_item_id) DO UPDATE SET target_level = excluded.target_level
                """, workshopItemId, targetLevel);
    }

    /** Level costs for a single item, ordered by level. */
    public List<WorkshopLevelCost> getCosts(long workshopItemId) {
        return jdbc.query("""
                SELECT level, base_cost
                FROM workshop_item_level_cost
                WHERE workshop_item_id = ?
                ORDER BY level
                """,
                (rs, i) -> new WorkshopLevelCost(rs.getInt("level"), rs.getDouble("base_cost")),
                workshopItemId);
    }

    /**
     * Set a Workshop item's current level, clamped to {@code [0, max_level]} — callers include
     * the raw, unvalidated {@code playerInfo.dat} importer, so out-of-range values must be
     * rejected here rather than trusted from the caller.
     * Also records the implied coin spend into the category's cumulative-spend tracker
     * so Workshop+ unlock progress stays accurate.
     */
    @Caching(evict = {
        @CacheEvict(value = "workshop", allEntries = true),
        @CacheEvict(value = "workshop-plus-spend", allEntries = true),
        @CacheEvict(value = "workshop-unlock-progress", allEntries = true)
    })
    public void updateLevel(long workshopItemId, int newLevel) {
        Map<String, Object> item = jdbc.queryForMap("""
                SELECT wi.max_level, wi.name, wi.is_plus, COALESCE(wis.current_level, 0) AS current_level
                FROM workshop_item wi
                LEFT JOIN workshop_item_state wis ON wis.workshop_item_id = wi.id
                WHERE wi.id = ?
                """, workshopItemId);
        int maxLevel = ((Number) item.get("max_level")).intValue();
        int oldLevel = ((Number) item.get("current_level")).intValue();
        int clampedLevel = Math.min(Math.max(newLevel, 0), maxLevel);

        jdbc.update("""
                INSERT INTO workshop_item_state (workshop_item_id, current_level) VALUES (?,?)
                ON CONFLICT(workshop_item_id) DO UPDATE SET current_level = excluded.current_level
                """, workshopItemId, clampedLevel);

        if (clampedLevel != oldLevel) {
            String name    = (String) item.get("name");
            boolean isPlus = ((Number) item.get("is_plus")).intValue() == 1;
            pendingRepo.record(isPlus ? "WORKSHOP_PLUS" : "WORKSHOP",
                    name, String.valueOf(oldLevel), String.valueOf(clampedLevel), null);
        }
    }

    /** Mark a Workshop (non-plus) unlock group as purchased. */
    @Caching(evict = {
        @CacheEvict(value = "workshop", allEntries = true),
        @CacheEvict(value = "workshop-unlock-progress", allEntries = true)
    })
    public void purchaseUnlockGroup(long unlockGroupId) {
        jdbc.update("""
                INSERT INTO workshop_unlock_group_state (unlock_group_id, is_purchased) VALUES (?,1)
                ON CONFLICT(unlock_group_id) DO UPDATE SET is_purchased = 1
                """, unlockGroupId);
    }

    // ── Workshop+ unlock progress ─────────────────────────────────────────────

    /**
     * Computes how many coins the player has spent on Workshop+ items per category.
     * Spend = SUM of base_cost for levels 1..current_level for each item,
     * applying no discount (thresholds use base costs).
     */
    @Cacheable("workshop-plus-spend")
    public List<PlusCategorySpend> getPlusCategorySpend() {
        return jdbc.query("""
                SELECT wc.name AS category,
                       COALESCE(SUM(spent.level_total), 0) AS total_spent
                FROM workshop_category wc
                LEFT JOIN (
                    SELECT wi.category_id,
                           SUM(wilc.base_cost) AS level_total
                    FROM workshop_item wi
                    JOIN workshop_item_state wis ON wis.workshop_item_id = wi.id
                    JOIN workshop_item_level_cost wilc ON wilc.workshop_item_id = wi.id
                                                      AND wilc.level <= wis.current_level
                    WHERE wi.is_plus = 1
                    GROUP BY wi.id
                ) spent ON spent.category_id = wc.id
                GROUP BY wc.id, wc.name
                ORDER BY wc.id
                """,
                (rs, i) -> new PlusCategorySpend(
                        rs.getString("category"),
                        rs.getDouble("total_spent")));
    }

    /**
     * For every locked Workshop+ item (lab-gated first items and spend-threshold items),
     * returns lock status, spend progress, and whether the prerequisite lab is done.
     * Lab-only items (first per category) have threshold/spent/remaining = 0.
     */
    @Cacheable("workshop-unlock-progress")
    public List<PlusUnlockProgress> getPlusUnlockProgress() {
        return jdbc.query("""
                SELECT
                    wi.id   AS item_id,
                    wi.name AS item_name,
                    wc.name AS category,
                    wi.sort_order,
                    COALESCE(wi.plus_unlock_cumulative_spend, 0) AS threshold,
                    COALESCE(cat_spend.total_spent, 0) AS spent,
                    MAX(0.0, COALESCE(wi.plus_unlock_cumulative_spend, 0) - COALESCE(cat_spend.total_spent, 0)) AS remaining,
                    CASE WHEN wi.plus_unlock_lab_name IS NOT NULL THEN 1 ELSE 0 END AS has_lab_requirement,
                    CASE WHEN wi.plus_unlock_lab_name IS NULL THEN 1
                         WHEN lab_state.current_level > 0    THEN 1
                         ELSE 0 END AS lab_completed
                FROM workshop_item wi
                JOIN workshop_category wc ON wc.id = wi.category_id
                -- per-category spend for this category
                LEFT JOIN (
                    SELECT wi2.category_id,
                           COALESCE(SUM(wilc.base_cost), 0) AS total_spent
                    FROM workshop_item wi2
                    JOIN workshop_item_state wis2 ON wis2.workshop_item_id = wi2.id
                    JOIN workshop_item_level_cost wilc ON wilc.workshop_item_id = wi2.id
                                                      AND wilc.level <= wis2.current_level
                    WHERE wi2.is_plus = 1
                    GROUP BY wi2.category_id
                ) cat_spend ON cat_spend.category_id = wi.category_id
                -- lab completion check (phase 1 gate)
                LEFT JOIN (
                    SELECT l.name, COALESCE(ps.current_level, 0) AS current_level
                    FROM lab l
                    LEFT JOIN lab_player_state ps ON ps.lab_id = l.id
                ) lab_state ON lab_state.name = wi.plus_unlock_lab_name
                WHERE wi.is_plus = 1
                  AND (wi.plus_unlock_lab_name IS NOT NULL OR wi.plus_unlock_cumulative_spend IS NOT NULL)
                  AND COALESCE((SELECT wis3.current_level FROM workshop_item_state wis3
                                WHERE wis3.workshop_item_id = wi.id), 0) = 0
                ORDER BY wc.id, wi.sort_order
                """,
                (rs, i) -> new PlusUnlockProgress(
                        rs.getLong("item_id"),
                        rs.getString("item_name"),
                        rs.getString("category"),
                        rs.getInt("sort_order"),
                        rs.getDouble("threshold"),
                        rs.getDouble("spent"),
                        rs.getDouble("remaining"),
                        rs.getInt("has_lab_requirement") == 1,
                        rs.getInt("lab_completed") == 1));
    }

    // ── Discounts ─────────────────────────────────────────────────────────────

    /**
     * Reads all six workshop discount labs and computes the effective cost multiplier
     * for each category (Workshop and Workshop+).
     * Each discount lab reduces cost by 0.5% per level.
     */
    @Cacheable("workshop-discounts")
    public WorkshopDiscounts getDiscounts() {
        double atkDisc  = labDiscountMult("Workshop Attack Discount");
        double defDisc  = labDiscountMult("Workshop Defense Discount");
        double utlDisc  = labDiscountMult("Workshop Utility Discount");
        double pAtkDisc = labDiscountMult("Enhancement Attack - Coin Discount");
        double pDefDisc = labDiscountMult("Enhancement Defense - Coin Discount");
        double pUtlDisc = labDiscountMult("Enhancement Utility - Coin Discount");
        return new WorkshopDiscounts(atkDisc, defDisc, utlDisc, pAtkDisc, pDefDisc, pUtlDisc);
    }

    private double labDiscountMult(String labName) {
        Integer level = jdbc.queryForObject("""
                SELECT COALESCE(ps.current_level, 0)
                FROM lab l
                LEFT JOIN lab_player_state ps ON ps.lab_id = l.id
                WHERE l.name = ?
                """, Integer.class, labName);
        int lvl = level != null ? level : 0;
        return Math.max(0.0, 1.0 - lvl * 0.005);
    }

    // ── Presets ───────────────────────────────────────────────────────────────

    public record PresetUnlock(boolean workshopUnlocked, boolean workshopPlusUnlocked) {}

    public record Preset(int id, boolean isPlus, int slot, String name) {}

    public record PresetItem(long workshopItemId, String itemName, int targetLevel) {}

    public PresetUnlock getPresetUnlocks() {
        boolean ws = Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT is_unlocked FROM workshop_preset_unlock WHERE is_plus = 0", Boolean.class));
        boolean wsp = Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT is_unlocked FROM workshop_preset_unlock WHERE is_plus = 1", Boolean.class));
        return new PresetUnlock(ws, wsp);
    }

    @CacheEvict(value = "workshop", allEntries = true)
    public void setPresetUnlocked(boolean isPlus, boolean unlocked) {
        jdbc.update("UPDATE workshop_preset_unlock SET is_unlocked = ? WHERE is_plus = ?",
                unlocked ? 1 : 0, isPlus ? 1 : 0);
    }

    public List<Preset> getPresets(boolean isPlus) {
        return jdbc.query("""
                SELECT id, is_plus, slot, name FROM workshop_preset
                WHERE is_plus = ? ORDER BY slot
                """,
                (rs, i) -> new Preset(
                        rs.getInt("id"),
                        rs.getInt("is_plus") == 1,
                        rs.getInt("slot"),
                        rs.getString("name")),
                isPlus ? 1 : 0);
    }

    public int upsertPreset(boolean isPlus, int slot, String name) {
        jdbc.update("""
                INSERT INTO workshop_preset (is_plus, slot, name) VALUES (?,?,?)
                ON CONFLICT(is_plus, slot) DO UPDATE SET name = excluded.name
                """, isPlus ? 1 : 0, slot, name);
        return jdbc.queryForObject(
                "SELECT id FROM workshop_preset WHERE is_plus = ? AND slot = ?",
                Integer.class, isPlus ? 1 : 0, slot);
    }

    public List<PresetItem> getPresetItems(int presetId) {
        return jdbc.query("""
                SELECT wpi.workshop_item_id, wi.name AS item_name, wpi.target_level
                FROM workshop_preset_item wpi
                JOIN workshop_item wi ON wi.id = wpi.workshop_item_id
                WHERE wpi.preset_id = ?
                ORDER BY wi.sort_order
                """,
                (rs, i) -> new PresetItem(
                        rs.getLong("workshop_item_id"),
                        rs.getString("item_name"),
                        rs.getInt("target_level")),
                presetId);
    }

    public void setPresetItems(int presetId, List<PresetItem> items) {
        jdbc.update("DELETE FROM workshop_preset_item WHERE preset_id = ?", presetId);
        if (items.isEmpty()) return;
        List<Object[]> batch = items.stream()
                .map(it -> new Object[]{presetId, it.workshopItemId(), it.targetLevel()})
                .toList();
        jdbc.batchUpdate(
                "INSERT INTO workshop_preset_item (preset_id, workshop_item_id, target_level) VALUES (?,?,?)",
                batch);
    }

    public void deletePreset(int presetId) {
        jdbc.update("DELETE FROM workshop_preset WHERE id = ?", presetId);
    }

}
