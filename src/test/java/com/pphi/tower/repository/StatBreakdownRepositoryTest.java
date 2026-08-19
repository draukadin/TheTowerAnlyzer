package com.pphi.tower.repository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import com.pphi.tower.db.DatabaseInitializer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class StatBreakdownRepositoryTest {

    private JdbcTemplate jdbc;
    private StatBreakdownRepository repository;

    @BeforeEach
    void setUp() throws Exception {
        var ds = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        jdbc = new JdbcTemplate(ds);
        new DatabaseInitializer(jdbc);
        repository = new StatBreakdownRepository(jdbc);

        jdbc.update("INSERT INTO module_def (id, code, name, type, effect_template) VALUES (1, 'GEN_A', 'Generator A', 'Generator', '')");
        jdbc.update("INSERT INTO module_def (id, code, name, type, effect_template) VALUES (2, 'GEN_B', 'Generator B', 'Generator', '')");

        jdbc.update("INSERT INTO module_player_state (module_def_id, owned, rarity, stars, level) VALUES (1, 1, 'Legendary', 0, 100)");
        jdbc.update("INSERT INTO module_player_state (module_def_id, owned, rarity, stars, level) VALUES (2, 1, 'Epic', 0, 1)");

        // substat_rarity deliberately mismatches the module's own rarity (mirrors a real report: a
        // Mythic+ module whose coins_kill_bonus substat was rolled/tracked as a lower rarity) — the
        // value must come from the module's own (rarity, level) via module_player_state, not from
        // substat_rarity.
        jdbc.update("INSERT INTO module_player_substat (module_def_id, slot_index, substat_key, substat_rarity, locked) VALUES (1, 0, 'coins_kill_bonus', 'Rare', 0)");
        jdbc.update("INSERT INTO module_player_substat (module_def_id, slot_index, substat_key, substat_rarity, locked) VALUES (2, 0, 'coins_kill_bonus', 'Rare', 0)");

        jdbc.update("INSERT INTO module_coin_bonus_level_value (module_rarity, level, value) VALUES ('Legendary', 100, 0.275)");
        jdbc.update("INSERT INTO module_coin_bonus_level_value (module_rarity, level, value) VALUES ('Epic', 1, 0.019)");
        jdbc.update("INSERT INTO module_coin_bonus_level_value (module_rarity, level, value) VALUES ('Rare', 100, 0.999)");
        jdbc.update("INSERT INTO module_coin_bonus_level_value (module_rarity, level, value) VALUES ('Rare', 1, 0.999)");

        // Module 1 -> Farming Primary; Module 2 -> Tournament Primary.
        jdbc.update("INSERT INTO module_preset_assignment (preset, slot, module_def_id) VALUES ('Farming', 'primary', 1)");
        jdbc.update("INSERT INTO module_preset_assignment (preset, slot, module_def_id) VALUES ('Tournament', 'primary', 2)");
    }

    @Test
    void getModuleSubstatValueForPreset_onlyIncludesModulesAssignedToThatPreset() {
        // Also a regression check for a live report: a Mythic+ module whose coins_kill_bonus
        // substat was tracked at 'Rare' returned the Rare-rarity value instead of Mythic+'s — the
        // fixture's substat_rarity ('Rare') deliberately mismatches each module's own rarity
        // ('Legendary'/'Epic'), with a 'Rare' trap value (0.999) seeded so a regression to keying
        // off substat_rarity would fail this assertion instead of silently passing.
        Double farming = repository.getModuleSubstatValueForPreset("coins_kill_bonus", "Farming");
        Double tournament = repository.getModuleSubstatValueForPreset("coins_kill_bonus", "Tournament");
        Double testing = repository.getModuleSubstatValueForPreset("coins_kill_bonus", "Testing");

        assertThat(farming).isCloseTo(0.275, within(0.0005));
        assertThat(tournament).isCloseTo(0.019, within(0.0005));
        assertThat(testing).isNull();
    }

    @Test
    void getModuleSubstatValueForPreset_sumsBothPrimaryAndAssistWithinSamePreset() {
        jdbc.update("INSERT INTO module_preset_assignment (preset, slot, module_def_id) VALUES ('Farming', 'assist', 2)");

        Double farming = repository.getModuleSubstatValueForPreset("coins_kill_bonus", "Farming");

        assertThat(farming).isCloseTo(0.275 + 0.019, within(0.0005));
    }
}
