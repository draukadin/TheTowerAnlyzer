package com.pphi.tower.util;

import com.pphi.tower.repository.LabRepository.LabGemMilestone;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GemRushCalculatorTest {

    private static final double EFFICIENCY = 1.705;

    // Official baseline gem milestone curve, per issue #59.
    private static final List<LabGemMilestone> MILESTONES = List.of(
            new LabGemMilestone(0.0, 0),
            new LabGemMilestone(0.04167, 8),
            new LabGemMilestone(1.0, 163),
            new LabGemMilestone(7.0, 1000),
            new LabGemMilestone(30.0, 3550),
            new LabGemMilestone(90.0, 8000),
            new LabGemMilestone(360.0, 25000)
    );

    private static long seconds(int days, int hours, int minutes) {
        return (days * 86400L) + (hours * 3600L) + (minutes * 60L);
    }

    @Test
    @DisplayName("8d 5h 59m rushes for 668 gems")
    void interpolatesWithinWeekToMonthBracket() {
        int cost = GemRushCalculator.calculateGemCost(MILESTONES, seconds(8, 5, 59), EFFICIENCY);
        assertThat(cost).isEqualTo(668);
    }

    @Test
    @DisplayName("33d 2h 58m rushes for 2218 gems")
    void interpolatesWithinMonthToQuarterBracket() {
        int cost = GemRushCalculator.calculateGemCost(MILESTONES, seconds(33, 2, 58), EFFICIENCY);
        assertThat(cost).isEqualTo(2218);
    }

    @Test
    @DisplayName("5d 16h 27m rushes for 479 gems")
    void interpolatesLab3() {
        int cost = GemRushCalculator.calculateGemCost(MILESTONES, seconds(5, 16, 27), EFFICIENCY);
        assertThat(cost).isEqualTo(479);
    }

    @Test
    @DisplayName("3d 8h 56m rushes for 290 gems")
    void interpolatesLab4() {
        int cost = GemRushCalculator.calculateGemCost(MILESTONES, seconds(3, 8, 56), EFFICIENCY);
        assertThat(cost).isEqualTo(290);
    }

    @Test
    @DisplayName("7d 17h 38m rushes for 635 gems")
    void interpolatesLab5() {
        // Note: issue #59's worked example states 634, but manual verification of its own
        // interpolation formula (1000 + ((7.734722-7)/23)*(3550-1000) = 1081.458, then
        // ceil(1081.458 / 1.705)) yields 635, not 634. Trusting the specified algorithm.
        int cost = GemRushCalculator.calculateGemCost(MILESTONES, seconds(7, 17, 38), EFFICIENCY);
        assertThat(cost).isEqualTo(635);
    }

    @Test
    @DisplayName("360+ days is capped at the max base gem ceiling")
    void capsAtMaxCeilingBeyond360Days() {
        long seconds = 400 * 86400L;
        int expected = (int) Math.ceil(25000.0 / EFFICIENCY);
        int cost = GemRushCalculator.calculateGemCost(MILESTONES, seconds, EFFICIENCY);
        assertThat(cost).isEqualTo(expected);
    }

    @Test
    @DisplayName("under an hour follows strict linear pricing off the origin")
    void interpolatesUnderOneHour() {
        int cost = GemRushCalculator.calculateGemCost(MILESTONES, 1800L, EFFICIENCY);
        assertThat(cost).isEqualTo(3);
    }

    @Test
    @DisplayName("zero remaining time costs nothing")
    void zeroRemainingTimeIsFree() {
        int cost = GemRushCalculator.calculateGemCost(MILESTONES, 0L, EFFICIENCY);
        assertThat(cost).isZero();
    }

    @Test
    @DisplayName("non-positive gem efficiency is rejected")
    void rejectsNonPositiveEfficiency() {
        assertThatThrownBy(() -> GemRushCalculator.calculateGemCost(MILESTONES, 1000L, 0))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
