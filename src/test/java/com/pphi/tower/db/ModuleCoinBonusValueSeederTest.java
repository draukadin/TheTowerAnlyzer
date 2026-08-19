package com.pphi.tower.db;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class ModuleCoinBonusValueSeederTest {

    @Test
    void freshDatabase_seedsGrowthFractionValues() throws Exception {
        var ds = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        var jdbc = new JdbcTemplate(ds);
        new DatabaseInitializer(jdbc);

        new ModuleCoinBonusValueSeeder(jdbc, null);

        Double value = jdbc.queryForObject("""
                SELECT value FROM module_coin_bonus_level_value
                WHERE module_rarity = 'Legendary' AND level = 100
                """, Double.class);
        assertThat(value).isCloseTo(0.275, within(0.0005));
    }

    @Test
    void staleAbsoluteMultiplierData_isMigratedToGrowthFraction() throws Exception {
        var ds = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        var jdbc = new JdbcTemplate(ds);
        new DatabaseInitializer(jdbc);

        // Simulate a database seeded before the bugfix: a full (pre-"+"-rarity) 1800-row table with
        // values stored as the absolute multiplier (e.g. 1.275) instead of the growth fraction
        // (0.275). Still short of the current 3000-row bundled set, so this also exercises the
        // "incomplete" path, not just "wrongConvention".
        jdbc.update("""
                INSERT INTO module_coin_bonus_level_value (module_rarity, level, value)
                VALUES ('Common', 1, 1.011), ('Legendary', 100, 1.275)
                """);

        new ModuleCoinBonusValueSeeder(jdbc, null);

        Double value = jdbc.queryForObject("""
                SELECT value FROM module_coin_bonus_level_value
                WHERE module_rarity = 'Legendary' AND level = 100
                """, Double.class);
        assertThat(value).isCloseTo(0.275, within(0.0005));
    }

    @Test
    void staleCorrectButIncompleteData_isBackfilledWithoutCrashing() throws Exception {
        var ds = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        var jdbc = new JdbcTemplate(ds);
        new DatabaseInitializer(jdbc);

        // Simulate a database seeded from the very first bundled resource, which only had Rare and
        // Epic at level 1 (already correct growth-fraction values, but far short of the full
        // 300-level x 10-rarity set) — seed() would otherwise never backfill this since the table
        // isn't empty, and the migration's low-level check must not throw when e.g. Common/level 1
        // doesn't exist yet.
        jdbc.update("""
                INSERT INTO module_coin_bonus_level_value (module_rarity, level, value)
                VALUES ('Rare', 1, 0.013), ('Epic', 1, 0.019)
                """);

        new ModuleCoinBonusValueSeeder(jdbc, null);

        Double legendary100 = jdbc.queryForObject("""
                SELECT value FROM module_coin_bonus_level_value
                WHERE module_rarity = 'Legendary' AND level = 100
                """, Double.class);
        assertThat(legendary100).isCloseTo(0.275, within(0.0005));

        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM module_coin_bonus_level_value", Integer.class);
        assertThat(count).isEqualTo(3000);
    }

    @Test
    void level157MythicPlus_reproducesInGameMultiplierWhenCombined() throws Exception {
        // Regression for a live report: a level 157 Mythic+ module whose coins_kill_bonus substat
        // was tracked at a lower rarity resolved to the wrong (lower) value. The value must come
        // from the module's own rarity ('Mythic+'), giving x1.641 in-game.
        var ds = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        var jdbc = new JdbcTemplate(ds);
        new DatabaseInitializer(jdbc);

        new ModuleCoinBonusValueSeeder(jdbc, null);

        Double value = jdbc.queryForObject("""
                SELECT value FROM module_coin_bonus_level_value
                WHERE module_rarity = 'Mythic+' AND level = 157
                """, Double.class);
        assertThat(1.0 + value).isCloseTo(1.641, within(0.0005));
    }
}
