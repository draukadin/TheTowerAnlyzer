package com.pphi.tower.db;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * Seeds {@code module_coin_bonus_level_value} from the bundled {@code module_substat_values.json}
 * on first boot. Values are keyed by the owning Generator module's own (rarity, level) — not by an
 * independently-tracked substat rarity — matching how the game actually scales this stat. Remote
 * content patches (see {@link com.pphi.tower.service.ContentPatchService}) can fill in additional
 * (rarity, level) values later without an app release.
 */
@Component
public class ModuleCoinBonusValueSeeder {

    private static final Logger log = LoggerFactory.getLogger(ModuleCoinBonusValueSeeder.class);
    private static final String MODULE_COIN_BONUS = "module_coin_bonus";

    private final JdbcTemplate jdbc;
    private final Map<String, Map<String, Double>> bundledValues;

    public ModuleCoinBonusValueSeeder(JdbcTemplate jdbc, DatabaseInitializer init) {
        this.jdbc = jdbc;
        this.bundledValues = ContentDefinitions
                .readModuleSubstatValues(new ClassPathResource("module_substat_values.json"))
                .get(MODULE_COIN_BONUS);
        seed();
        migrateToGrowthFraction();
    }

    private void seed() {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM module_coin_bonus_level_value", Integer.class);
        if (count != null && count > 0) return;

        log.info("Seeding ModuleCoinBonusLevelValue...");
        upsertAll();
        log.info("Finished seeding ModuleCoinBonusLevelValue");
    }

    /**
     * Backfills live databases seeded before either (a) the "+"-rarity tiers (Rare+, Epic+,
     * Legendary+, Mythic+) were added to the bundled data, or (b) values were stored as the raw
     * growth fraction rather than the absolute multiplier. Detects staleness two ways: (1) row
     * count short of the full bundled set, or (2) a low-level value &gt;= 1.0 — level 1-5 growth
     * fractions are always well under 1.0, while the old absolute-multiplier convention was always
     * &gt;= 1.0 by construction (high-level growth fractions can legitimately exceed 1.0, so this
     * check is deliberately restricted to low levels). Self-limiting: once corrected, both checks
     * are false and this is a no-op.
     */
    private void migrateToGrowthFraction() {
        int expectedCount = bundledValues.values().stream().mapToInt(Map::size).sum();

        Integer actualCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM module_coin_bonus_level_value", Integer.class);
        Double minLowLevelValue = jdbc.queryForObject(
                "SELECT MIN(value) FROM module_coin_bonus_level_value WHERE level <= 5", Double.class);

        boolean incomplete = actualCount == null || actualCount < expectedCount;
        boolean wrongConvention = minLowLevelValue != null && minLowLevelValue >= 1.0;
        if (!incomplete && !wrongConvention) return;

        log.info("Migrating ModuleCoinBonusLevelValue (incomplete={}, wrongConvention={})...",
                incomplete, wrongConvention);
        jdbc.update("DELETE FROM module_coin_bonus_level_value");
        upsertAll();
    }

    private void upsertAll() {
        for (var rarityEntry : bundledValues.entrySet()) {
            for (var levelEntry : rarityEntry.getValue().entrySet()) {
                jdbc.update(
                        "INSERT OR IGNORE INTO module_coin_bonus_level_value (module_rarity, level, value) VALUES (?, ?, ?)",
                        rarityEntry.getKey(),
                        Integer.parseInt(levelEntry.getKey()), levelEntry.getValue());
            }
        }
    }
}
