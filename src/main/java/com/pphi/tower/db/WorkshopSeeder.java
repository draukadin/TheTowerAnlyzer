package com.pphi.tower.db;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

@Component
public class WorkshopSeeder {

    private static final Logger log = LoggerFactory.getLogger(WorkshopSeeder.class);

    private final JdbcTemplate jdbc;

    public WorkshopSeeder(JdbcTemplate jdbc, DatabaseInitializer init) {
        this.jdbc = jdbc;
        seed();
    }

    private void seed() {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM workshop_item", Integer.class);
        if (count != null && count > 0) return;
        log.info("Seeding {}...", this.getClass().getSimpleName().replace("Seeder", ""));
        seedWorkshop(ContentDefinitions.readWorkshopDefinitions());
        log.info("Finished seeding {}", this.getClass().getSimpleName().replace("Seeder", ""));
    }

    private void seedWorkshop(ContentDefinitions.WorkshopDefinitions defs) {
        Map<String, Long> groupIdsByKey = new HashMap<>();
        for (ContentDefinitions.WorkshopUnlockGroupDefinition g : defs.unlockGroups()) {
            groupIdsByKey.put(g.key(), group(g.categoryId(), g.unlockCost()));
        }
        for (ContentDefinitions.WorkshopItemDefinition i : defs.items()) {
            Long unlockGroupId = i.unlockGroupKey() != null ? groupIdsByKey.get(i.unlockGroupKey()) : null;
            item(i.name(), i.categoryId(), i.isPlus(), i.sortOrder(), i.maxLevel(),
                    unlockGroupId, i.plusUnlockLabName(), i.plusUnlockCumulativeSpend());
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private long group(int categoryId, long unlockCost) {
        return jdbc.queryForObject(
                "INSERT INTO workshop_unlock_group (category_id, unlock_cost) VALUES (?,?) RETURNING id",
                Long.class, categoryId, (double) unlockCost);
    }

    private void item(String name, int categoryId, int isPlus, int sortOrder, int maxLevel,
                      Long unlockGroupId, String plusUnlockLabName, Double plusUnlockCumulativeSpend) {
        Long id = jdbc.queryForObject(
                """
                INSERT INTO workshop_item
                    (name, category_id, is_plus, sort_order, max_level,
                     unlock_group_id, plus_unlock_lab_name, plus_unlock_cumulative_spend)
                VALUES (?,?,?,?,?,?,?,?) RETURNING id
                """,
                Long.class,
                name, categoryId, isPlus, sortOrder, maxLevel,
                unlockGroupId, plusUnlockLabName, plusUnlockCumulativeSpend);
        if (id != null) {
            jdbc.update("INSERT INTO workshop_item_state (workshop_item_id) VALUES (?)", id);
        }
        if (unlockGroupId != null) {
            jdbc.update(
                    "INSERT OR IGNORE INTO workshop_unlock_group_state (unlock_group_id) VALUES (?)",
                    unlockGroupId);
        }
    }
}
