package com.pphi.tower.service;

import com.pphi.tower.db.ContentDefinitions;
import com.pphi.tower.db.DatabaseInitializer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ContentPatchApplierTest {

    private JdbcTemplate jdbc;
    private ContentPatchApplier applier;

    @BeforeEach
    void setUp() throws Exception {
        var ds = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        jdbc = new JdbcTemplate(ds);
        new DatabaseInitializer(jdbc);
        applier = new ContentPatchApplier(jdbc);

        // Seed one existing lab and one existing workshop item with player progress, so
        // updates can be verified to preserve that progress.
        jdbc.update("INSERT INTO lab (name, category, max_level) VALUES ('Damage','Attack',100)");
        long labId = jdbc.queryForObject("SELECT id FROM lab WHERE name='Damage'", Long.class);
        jdbc.update("INSERT INTO lab_player_state (lab_id, current_level, target_level) VALUES (?, 42, 50)", labId);

        jdbc.update("INSERT INTO workshop_item (name, category_id, is_plus, sort_order, max_level) VALUES ('Health',2,0,1,6000)");
        long itemId = jdbc.queryForObject("SELECT id FROM workshop_item WHERE name='Health' AND is_plus=0", Long.class);
        jdbc.update("INSERT INTO workshop_item_state (workshop_item_id, current_level) VALUES (?, 17)", itemId);
    }

    private static final ContentDefinitions.WorkshopDefinitions EMPTY_WORKSHOP =
            new ContentDefinitions.WorkshopDefinitions(List.of(), List.of());

    @Test
    void apply_newLab_insertsDefinitionAndZeroedPlayerState() {
        var labDefs = List.of(new ContentDefinitions.LabDefinition("New Lab", "Attack", 10));

        var summary = applier.apply(1, labDefs, Map.of(), EMPTY_WORKSHOP, Map.of(), Map.of(), Map.of(), Map.of());

        assertThat(summary.labsAdded()).isEqualTo(1);
        assertThat(summary.labsUpdated()).isZero();
        Long labId = jdbc.queryForObject("SELECT id FROM lab WHERE name='New Lab'", Long.class);
        assertThat(labId).isNotNull();
        Integer currentLevel = jdbc.queryForObject(
                "SELECT current_level FROM lab_player_state WHERE lab_id = ?", Integer.class, labId);
        assertThat(currentLevel).isZero();
    }

    @Test
    void apply_existingLab_updatesDefinitionButPreservesPlayerProgress() {
        var labDefs = List.of(new ContentDefinitions.LabDefinition("Damage", "Attack", 200));

        var summary = applier.apply(1, labDefs, Map.of(), EMPTY_WORKSHOP, Map.of(), Map.of(), Map.of(), Map.of());

        assertThat(summary.labsAdded()).isZero();
        assertThat(summary.labsUpdated()).isEqualTo(1);
        Integer maxLevel = jdbc.queryForObject("SELECT max_level FROM lab WHERE name='Damage'", Integer.class);
        assertThat(maxLevel).isEqualTo(200);
        Integer currentLevel = jdbc.queryForObject(
                "SELECT lps.current_level FROM lab_player_state lps JOIN lab l ON l.id = lps.lab_id WHERE l.name='Damage'",
                Integer.class);
        assertThat(currentLevel).isEqualTo(42);
    }

    @Test
    void apply_labLevelCosts_areUpserted() {
        var labDefs = List.of(new ContentDefinitions.LabDefinition("Damage", "Attack", 100));
        var costs = Map.of("Damage", Map.of("1", new ContentDefinitions.LabCostEntry(60, 100.0)));

        applier.apply(1, labDefs, costs, EMPTY_WORKSHOP, Map.of(), Map.of(), Map.of(), Map.of());

        Map<String, Object> row = jdbc.queryForMap(
                "SELECT duration_seconds, coin_cost FROM lab_level_cost lc JOIN lab l ON l.id = lc.lab_id " +
                        "WHERE l.name = 'Damage' AND level = 1");
        assertThat(((Number) row.get("duration_seconds")).intValue()).isEqualTo(60);
        assertThat(((Number) row.get("coin_cost")).doubleValue()).isEqualTo(100.0);
    }

    @Test
    void apply_newWorkshopItem_insertsDefinitionAndUnlockGroupAndZeroedPlayerState() {
        var groups = List.of(new ContentDefinitions.WorkshopUnlockGroupDefinition("newGroup", 1, 999));
        var items = List.of(new ContentDefinitions.WorkshopItemDefinition(
                "New Item", 1, 0, 1, 50, "newGroup", null, null));
        var workshopDefs = new ContentDefinitions.WorkshopDefinitions(groups, items);

        var summary = applier.apply(1, List.of(), Map.of(), workshopDefs, Map.of(), Map.of(), Map.of(), Map.of());

        assertThat(summary.workshopItemsAdded()).isEqualTo(1);
        Long itemId = jdbc.queryForObject("SELECT id FROM workshop_item WHERE name='New Item' AND is_plus=0", Long.class);
        assertThat(itemId).isNotNull();
        Integer currentLevel = jdbc.queryForObject(
                "SELECT current_level FROM workshop_item_state WHERE workshop_item_id = ?", Integer.class, itemId);
        assertThat(currentLevel).isZero();
    }

    @Test
    void apply_existingWorkshopItem_updatesDefinitionButPreservesPlayerProgress() {
        var items = List.of(new ContentDefinitions.WorkshopItemDefinition(
                "Health", 2, 0, 1, 9000, null, null, null));
        var workshopDefs = new ContentDefinitions.WorkshopDefinitions(List.of(), items);

        var summary = applier.apply(1, List.of(), Map.of(), workshopDefs, Map.of(), Map.of(), Map.of(), Map.of());

        assertThat(summary.workshopItemsUpdated()).isEqualTo(1);
        Integer maxLevel = jdbc.queryForObject("SELECT max_level FROM workshop_item WHERE name='Health' AND is_plus=0", Integer.class);
        assertThat(maxLevel).isEqualTo(9000);
        Integer currentLevel = jdbc.queryForObject(
                "SELECT wis.current_level FROM workshop_item_state wis JOIN workshop_item wi ON wi.id = wis.workshop_item_id " +
                        "WHERE wi.name = 'Health' AND wi.is_plus = 0", Integer.class);
        assertThat(currentLevel).isEqualTo(17);
    }

    @Test
    void apply_workshopItemLevelCostAndValue_areUpsertedForBothRegularAndPlusItems() {
        jdbc.update("INSERT INTO workshop_item (name, category_id, is_plus, sort_order, max_level) VALUES ('Health +',2,1,1,400)");

        var costs = Map.of("Health", Map.of("1", 10.0));
        var plusCosts = Map.of("Health +", Map.of("1", 5_000_000.0));
        var values = Map.of("Health", Map.of("0", 1.0, "1", 1.05));
        var plusValues = Map.of("Health +", Map.of("0", 2.0));

        applier.apply(1, List.of(), Map.of(), EMPTY_WORKSHOP, costs, plusCosts, values, plusValues);

        Double regularCost = jdbc.queryForObject(
                "SELECT base_cost FROM workshop_item_level_cost wlc JOIN workshop_item wi ON wi.id = wlc.workshop_item_id " +
                        "WHERE wi.name = 'Health' AND wi.is_plus = 0 AND level = 1", Double.class);
        assertThat(regularCost).isEqualTo(10.0);

        Double plusCost = jdbc.queryForObject(
                "SELECT base_cost FROM workshop_item_level_cost wlc JOIN workshop_item wi ON wi.id = wlc.workshop_item_id " +
                        "WHERE wi.name = 'Health +' AND wi.is_plus = 1 AND level = 1", Double.class);
        assertThat(plusCost).isEqualTo(5_000_000.0);

        Double regularValue = jdbc.queryForObject(
                "SELECT value FROM workshop_item_level_value wlv JOIN workshop_item wi ON wi.id = wlv.workshop_item_id " +
                        "WHERE wi.name = 'Health' AND wi.is_plus = 0 AND level = 1", Double.class);
        assertThat(regularValue).isEqualTo(1.05);

        Double plusValue = jdbc.queryForObject(
                "SELECT value FROM workshop_item_level_value wlv JOIN workshop_item wi ON wi.id = wlv.workshop_item_id " +
                        "WHERE wi.name = 'Health +' AND wi.is_plus = 1 AND level = 0", Double.class);
        assertThat(plusValue).isEqualTo(2.0);
    }

    @Test
    void apply_costForUnknownItemName_isSkippedWithoutError() {
        var costs = Map.of("Nonexistent Item", Map.of("1", 10.0));

        var summary = applier.apply(1, List.of(), Map.of(), EMPTY_WORKSHOP, costs, Map.of(), Map.of(), Map.of());

        assertThat(summary.workshopItemsAdded()).isZero();
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM workshop_item_level_cost", Integer.class);
        assertThat(count).isZero();
    }

    @Test
    void apply_newPlusWorkshopItem_withCumulativeSpendUnlock_hasNullUnlockGroup() {
        var items = List.of(new ContentDefinitions.WorkshopItemDefinition(
                "Rend Armor Mult +", 1, 1, 2, 400, null, null, 50_000_000_000.0));
        var workshopDefs = new ContentDefinitions.WorkshopDefinitions(List.of(), items);

        applier.apply(1, List.of(), Map.of(), workshopDefs, Map.of(), Map.of(), Map.of(), Map.of());

        Map<String, Object> row = jdbc.queryForMap(
                "SELECT unlock_group_id, plus_unlock_lab_name, plus_unlock_cumulative_spend FROM workshop_item " +
                        "WHERE name = 'Rend Armor Mult +' AND is_plus = 1");
        assertThat(row.get("unlock_group_id")).isNull();
        assertThat(row.get("plus_unlock_lab_name")).isNull();
        assertThat(((Number) row.get("plus_unlock_cumulative_spend")).doubleValue()).isEqualTo(50_000_000_000.0);
    }

    @Test
    void apply_recordsAppliedContentVersion() {
        applier.apply(7, List.of(), Map.of(), EMPTY_WORKSHOP, Map.of(), Map.of(), Map.of(), Map.of());

        Integer version = jdbc.queryForObject("SELECT applied_version FROM content_patch_state WHERE id = 1", Integer.class);
        assertThat(version).isEqualTo(7);
    }
}
