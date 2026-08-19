package com.pphi.tower.db;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class CosmeticSeederTest {

    private JdbcTemplate jdbc;

    @BeforeEach
    void setUp() throws Exception {
        var ds = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        jdbc = new JdbcTemplate(ds);
        new DatabaseInitializer(jdbc);
        new CosmeticSeeder(jdbc, null);
    }

    @ParameterizedTest
    @CsvSource({
            "song,0.006",
            "profile_banner,0.006",
            "tower_skin,0.004",
            "milestone_skin,0.004",
            "menu,0.006",
            "background_skin,0.008",
            "guardian,0.006",
    })
    void coinBonusPerItem_matchesPlayerSuppliedValues(String categoryId, double expected) {
        Double actual = jdbc.queryForObject(
                "SELECT coin_bonus_per_item FROM cosmetic_category WHERE id = ?", Double.class, categoryId);

        assertThat(actual).isCloseTo(expected, within(0.0005));
    }
}
