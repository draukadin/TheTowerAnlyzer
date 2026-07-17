package com.pphi.tower.db;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.core.io.ClassPathResource;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/**
 * Verifies the bundled {@code module_coin_bonus} curve in {@code module_substat_values.json}
 * against the Generator module's own MODSTAT_GENERATOR(rarity, level) formula, using known-good
 * (rarity, level) -> multiplier data points the player captured directly from the game's formula
 * reference (not derived from this codebase). Stored values are the raw growth fraction (the
 * formula's result minus 1), matching the {@code relic.bonus_value} convention elsewhere in this
 * codebase, since {@link com.pphi.tower.service.CoinBonusService} combines this stat as
 * {@code 1.0 + moduleSubstatValue}. Values are keyed by the owning module's own rarity (not an
 * independently-tracked substat rarity).
 */
class ModuleSubstatValuesResourceTest {

    private static final Map<String, Map<String, Double>> COINS_KILL_BONUS =
            ContentDefinitions.readModuleSubstatValues(new ClassPathResource("module_substat_values.json"))
                    .get("module_coin_bonus");

    @ParameterizedTest
    @CsvSource({
            "Common,1,0.011",
            "Common,20,0.030",
            "Rare,1,0.013",
            "Rare,20,0.032",
            "Rare,25,0.037",
            "Rare,30,0.042",
            "Rare+,1,0.016",
            "Rare+,6,0.021",
            "Rare+,11,0.026",
            "Rare+,16,0.031",
            "Rare+,21,0.036",
            "Rare+,26,0.041",
            "Rare+,31,0.047",
            "Rare+,36,0.057",
            "Rare+,37,0.059",
            "Rare+,38,0.061",
            "Rare+,39,0.063",
            "Rare+,40,0.065",
            "Epic,1,0.019",
            "Epic,11,0.029",
            "Epic,21,0.039",
            "Epic,31,0.050",
            "Epic,41,0.071",
            "Epic,51,0.101",
            "Epic,60,0.128",
            "Epic+,1,0.023",
            "Epic+,11,0.033",
            "Epic+,21,0.043",
            "Epic+,31,0.054",
            "Epic+,41,0.075",
            "Epic+,51,0.105",
            "Epic+,60,0.132",
            "Epic+,71,0.165",
            "Epic+,80,0.192",
            "Legendary,1,0.026",
            "Legendary,25,0.050",
            "Legendary,50,0.105",
            "Legendary,80,0.195",
            "Legendary,100,0.275",
            "Legendary+,1,0.029",
            "Legendary+,25,0.053",
            "Legendary+,50,0.108",
            "Legendary+,75,0.183",
            "Legendary+,100,0.278",
            "Legendary+,120,0.378",
            "Mythic,1,0.033",
            "Mythic,50,0.112",
            "Mythic,75,0.187",
            "Mythic,100,0.282",
            "Mythic,101,0.287",
            "Mythic,140,0.502",
            "Mythic+,1,0.036",
            "Mythic+,2,0.037",
            "Mythic+,21,0.056",
            "Mythic+,100,0.285",
            "Mythic+,101,0.290",
            "Mythic+,157,0.641",
            "Mythic+,160,0.665",
            "Ancestral,1,0.041",
            "Ancestral,160,0.670",
            "Ancestral,161,0.680",
            "Ancestral,180,0.870",
    })
    void coinsKillBonus_matchesGeneratorModuleFormula(String rarity, int level, double expectedGrowthFraction) {
        Double actual = COINS_KILL_BONUS.get(rarity).get(String.valueOf(level));
        assertThat(actual).isNotNull();
        assertThat(actual).isCloseTo(expectedGrowthFraction, within(0.0005));
    }

    @Test
    void coinsKillBonus_level100Legendary_reproducesInGameMultiplierWhenCombined() {
        // Single-substat sanity check against the in-game "Modules" factor for a level 100
        // Legendary module: x1.275.
        double combined = 1.0 + COINS_KILL_BONUS.get("Legendary").get("100");
        assertThat(combined).isCloseTo(1.275, within(0.0005));
    }

    @Test
    void coinsKillBonus_level157MythicPlus_reproducesInGameMultiplierWhenCombined() {
        // Regression check: "Mythic+" is a distinct rarity tier from "Mythic" in the formula's own
        // base-stat table (0.036 vs 0.033), not a star modifier — a module reported in-game as
        // x1.641 at level 157 must resolve via the "Mythic+" row, not fall back to "Mythic" (x1.638).
        double combined = 1.0 + COINS_KILL_BONUS.get("Mythic+").get("157");
        assertThat(combined).isCloseTo(1.641, within(0.0005));
    }

    @Test
    void coinsKillBonus_coversAllTenRaritiesForAllThreeHundredLevels() {
        for (String rarity : new String[] {
                "Common", "Rare", "Rare+", "Epic", "Epic+",
                "Legendary", "Legendary+", "Mythic", "Mythic+", "Ancestral"}) {
            Map<String, Double> byLevel = COINS_KILL_BONUS.get(rarity);
            assertThat(byLevel).as("rarity " + rarity).isNotNull();
            assertThat(byLevel).as("rarity " + rarity).hasSize(300);
        }
    }
}
