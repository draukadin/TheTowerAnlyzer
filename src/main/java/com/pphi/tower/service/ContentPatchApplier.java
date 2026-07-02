package com.pphi.tower.service;

import com.pphi.tower.db.ContentDefinitions;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.Map;

/**
 * Applies a parsed content patch to the local database via natural-key upserts. A brand-new
 * lab/workshop item gets a fresh player-state row (level 0); an existing one only has its
 * definition columns updated — {@code lab_player_state}/{@code workshop_item_state} (the
 * player's researched progress) is never touched for rows that already existed.
 *
 * <p>Kept as a separate bean (rather than a method on {@link ContentPatchService}) so
 * {@link Transactional} is honored — {@code ContentPatchService} calls this through the Spring
 * proxy rather than via self-invocation, which {@code @Transactional} would silently ignore.
 */
@Component
public class ContentPatchApplier {

    private final JdbcTemplate jdbc;

    public ContentPatchApplier(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record Summary(int labsAdded, int labsUpdated, int workshopItemsAdded, int workshopItemsUpdated) {}

    @Transactional
    public Summary apply(
            int contentVersion,
            java.util.List<ContentDefinitions.LabDefinition> labDefs,
            Map<String, Map<String, ContentDefinitions.LabCostEntry>> labCosts,
            ContentDefinitions.WorkshopDefinitions workshopDefs,
            Map<String, Map<String, Double>> workshopCosts,
            Map<String, Map<String, Double>> workshopPlusCosts,
            Map<String, Map<String, Double>> workshopValues,
            Map<String, Map<String, Double>> enhancementValues) {

        int labsAdded = 0, labsUpdated = 0;
        for (ContentDefinitions.LabDefinition def : labDefs) {
            if (upsertLab(def)) labsAdded++; else labsUpdated++;
        }
        applyLabCosts(labCosts);

        Map<String, Long> groupIdsByKey = new HashMap<>();
        for (ContentDefinitions.WorkshopUnlockGroupDefinition g : workshopDefs.unlockGroups()) {
            groupIdsByKey.put(g.key(), upsertWorkshopUnlockGroup(g));
        }

        int itemsAdded = 0, itemsUpdated = 0;
        for (ContentDefinitions.WorkshopItemDefinition def : workshopDefs.items()) {
            Long unlockGroupId = def.unlockGroupKey() != null ? groupIdsByKey.get(def.unlockGroupKey()) : null;
            if (upsertWorkshopItem(def, unlockGroupId)) itemsAdded++; else itemsUpdated++;
        }
        applyWorkshopItemLevelCost(workshopCosts, 0);
        applyWorkshopItemLevelCost(workshopPlusCosts, 1);
        applyWorkshopItemLevelValue(workshopValues, 0);
        applyWorkshopItemLevelValue(enhancementValues, 1);

        jdbc.update(
                "UPDATE content_patch_state SET applied_version = ?, applied_at = datetime('now') WHERE id = 1",
                contentVersion);

        return new Summary(labsAdded, labsUpdated, itemsAdded, itemsUpdated);
    }

    /** @return true if this was a brand-new lab (false if an existing one was updated). */
    private boolean upsertLab(ContentDefinitions.LabDefinition def) {
        Long existingId = jdbc.query(
                "SELECT id FROM lab WHERE name = ?",
                rs -> rs.next() ? rs.getLong("id") : null, def.name());
        if (existingId == null) {
            Long id = jdbc.queryForObject(
                    "INSERT INTO lab (name, category, max_level) VALUES (?,?,?) RETURNING id",
                    Long.class, def.name(), def.category(), def.maxLevel());
            jdbc.update(
                    "INSERT INTO lab_player_state (lab_id, current_level, target_level) VALUES (?, 0, NULL)",
                    id);
            return true;
        }
        jdbc.update("UPDATE lab SET category = ?, max_level = ? WHERE id = ?",
                def.category(), def.maxLevel(), existingId);
        return false;
    }

    private void applyLabCosts(Map<String, Map<String, ContentDefinitions.LabCostEntry>> labCosts) {
        for (var labEntry : labCosts.entrySet()) {
            Long labId = jdbc.query("SELECT id FROM lab WHERE name = ?",
                    rs -> rs.next() ? rs.getLong("id") : null, labEntry.getKey());
            if (labId == null) continue;
            for (var levelEntry : labEntry.getValue().entrySet()) {
                int level = Integer.parseInt(levelEntry.getKey());
                ContentDefinitions.LabCostEntry cost = levelEntry.getValue();
                jdbc.update(
                        "INSERT OR REPLACE INTO lab_level_cost (lab_id, level, duration_seconds, coin_cost) VALUES (?,?,?,?)",
                        labId, level, cost.durationSeconds(), cost.coinCost());
            }
        }
    }

    private Long upsertWorkshopUnlockGroup(ContentDefinitions.WorkshopUnlockGroupDefinition g) {
        Long existingId = jdbc.query(
                "SELECT id FROM workshop_unlock_group WHERE category_id = ? AND unlock_cost = ?",
                rs -> rs.next() ? rs.getLong("id") : null, g.categoryId(), (double) g.unlockCost());
        if (existingId != null) return existingId;
        Long id = jdbc.queryForObject(
                "INSERT INTO workshop_unlock_group (category_id, unlock_cost) VALUES (?,?) RETURNING id",
                Long.class, g.categoryId(), (double) g.unlockCost());
        jdbc.update("INSERT OR IGNORE INTO workshop_unlock_group_state (unlock_group_id) VALUES (?)", id);
        return id;
    }

    /** @return true if this was a brand-new workshop item (false if an existing one was updated). */
    private boolean upsertWorkshopItem(ContentDefinitions.WorkshopItemDefinition def, Long unlockGroupId) {
        Long existingId = jdbc.query(
                "SELECT id FROM workshop_item WHERE name = ? AND is_plus = ?",
                rs -> rs.next() ? rs.getLong("id") : null, def.name(), def.isPlus());
        if (existingId == null) {
            Long id = jdbc.queryForObject(
                    """
                    INSERT INTO workshop_item
                        (name, category_id, is_plus, sort_order, max_level,
                         unlock_group_id, plus_unlock_lab_name, plus_unlock_cumulative_spend)
                    VALUES (?,?,?,?,?,?,?,?) RETURNING id
                    """,
                    Long.class, def.name(), def.categoryId(), def.isPlus(), def.sortOrder(), def.maxLevel(),
                    unlockGroupId, def.plusUnlockLabName(), def.plusUnlockCumulativeSpend());
            jdbc.update("INSERT INTO workshop_item_state (workshop_item_id) VALUES (?)", id);
            if (unlockGroupId != null) {
                jdbc.update("INSERT OR IGNORE INTO workshop_unlock_group_state (unlock_group_id) VALUES (?)", unlockGroupId);
            }
            return true;
        }
        jdbc.update(
                """
                UPDATE workshop_item
                SET category_id = ?, sort_order = ?, max_level = ?, unlock_group_id = ?,
                    plus_unlock_lab_name = ?, plus_unlock_cumulative_spend = ?
                WHERE id = ?
                """,
                def.categoryId(), def.sortOrder(), def.maxLevel(), unlockGroupId,
                def.plusUnlockLabName(), def.plusUnlockCumulativeSpend(), existingId);
        return false;
    }

    private void applyWorkshopItemLevelCost(Map<String, Map<String, Double>> data, int isPlus) {
        for (var itemEntry : data.entrySet()) {
            Long itemId = workshopItemId(itemEntry.getKey(), isPlus);
            if (itemId == null) continue;
            for (var levelEntry : itemEntry.getValue().entrySet()) {
                jdbc.update(
                        "INSERT OR REPLACE INTO workshop_item_level_cost (workshop_item_id, level, base_cost) VALUES (?,?,?)",
                        itemId, Integer.parseInt(levelEntry.getKey()), levelEntry.getValue());
            }
        }
    }

    private void applyWorkshopItemLevelValue(Map<String, Map<String, Double>> data, int isPlus) {
        for (var itemEntry : data.entrySet()) {
            Long itemId = workshopItemId(itemEntry.getKey(), isPlus);
            if (itemId == null) continue;
            for (var levelEntry : itemEntry.getValue().entrySet()) {
                jdbc.update(
                        "INSERT OR REPLACE INTO workshop_item_level_value (workshop_item_id, level, value) VALUES (?,?,?)",
                        itemId, Integer.parseInt(levelEntry.getKey()), levelEntry.getValue());
            }
        }
    }

    private Long workshopItemId(String name, int isPlus) {
        return jdbc.query(
                "SELECT id FROM workshop_item WHERE name = ? AND is_plus = ?",
                rs -> rs.next() ? rs.getLong("id") : null, name, isPlus);
    }
}
