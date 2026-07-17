package com.pphi.tower.db;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.core.io.ClassPathResource;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/**
 * Verifies the bundled {@code tier_coin_multiplier.json} against the player-supplied difficulty
 * tier coin bonus table (T1-T21) used by the in-game "All Coins Bonuses" screen.
 */
class TierCoinMultiplierResourceTest {

    private static final Map<String, Double> MULTIPLIERS =
            ContentDefinitions.readFlatNumericMap(new ClassPathResource("tier_coin_multiplier.json"));

    @ParameterizedTest
    @CsvSource({
            "1,1.0", "2,1.8", "3,2.6", "4,3.4", "5,4.2", "6,5.0", "7,5.8", "8,6.6", "9,7.5", "10,8.7",
            "11,10.3", "12,12.2", "13,14.7", "14,17.6", "15,21.3", "16,25.2", "17,29.1", "18,33.0",
            "19,40.0", "20,48.0", "21,60.0",
    })
    void tierCoinMultiplier_matchesPlayerSuppliedTable(int tier, double expected) {
        Double actual = MULTIPLIERS.get(String.valueOf(tier));
        assertThat(actual).isNotNull();
        assertThat(actual).isCloseTo(expected, within(0.0005));
    }

    @Test
    void tierCoinMultiplier_coversTiersOneThroughTwentyOne() {
        assertThat(MULTIPLIERS).hasSize(21);
    }
}
