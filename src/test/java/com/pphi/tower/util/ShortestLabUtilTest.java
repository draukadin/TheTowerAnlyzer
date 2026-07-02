package com.pphi.tower.util;

import com.pphi.tower.repository.LabRepository;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ShortestLabUtilTest {

    private static final LabRepository.LabMultipliers NO_MULTIPLIERS =
            new LabRepository.LabMultipliers(1.0, 1.0, 0, 0, 0.0);

    private static LabRepository.LabData lab(long id, int currentLevel) {
        return new LabRepository.LabData(id, "Lab " + id, "OFFENSE", 10, currentLevel, null, "desc", null);
    }

    private static LabRepository.LabLevelCost cost(int level, long durationSeconds, double coinCost) {
        return new LabRepository.LabLevelCost(level, durationSeconds, coinCost);
    }

    @Test
    void sumsRemainingLevelsAboveCurrentLevel() {
        List<LabRepository.LabData> labs = List.of(lab(1, 1));
        Map<Long, List<LabRepository.LabLevelCost>> costs = Map.of(
                1L, List.of(
                        cost(1, 100, 10.0),
                        cost(2, 200, 20.0),
                        cost(3, 300, 30.0)
                ));

        Map<Long, LabRepository.LabLevelCost> result =
                ShortestLabUtil.computeShortestLabsToMax(labs, costs, NO_MULTIPLIERS, 30, 1.0);

        assertEquals(1, result.size());
        LabRepository.LabLevelCost total = result.get(1L);
        assertEquals(3, total.level());
        assertEquals(500, total.durationSeconds());
        assertEquals(50.0, total.coinCost());
    }

    @Test
    void appliesSpeedAndCoinMultipliers() {
        List<LabRepository.LabData> labs = List.of(lab(1, 0));
        Map<Long, List<LabRepository.LabLevelCost>> costs = Map.of(
                1L, List.of(cost(1, 1000, 100.0)));
        LabRepository.LabMultipliers multipliers =
                new LabRepository.LabMultipliers(2.0, 0.5, 50, 50, 1.0);

        Map<Long, LabRepository.LabLevelCost> result =
                ShortestLabUtil.computeShortestLabsToMax(labs, costs, multipliers, 30, 1.0);

        LabRepository.LabLevelCost total = result.get(1L);
        // duration halved by speedMult=2.0
        assertEquals(500, total.durationSeconds());
        // coin cost halved by costMult=0.5
        assertEquals(50.0, total.coinCost());
    }

    @Test
    void appliesCellSpeedMultiplierOnTopOfSpeedMult() {
        List<LabRepository.LabData> labs = List.of(lab(1, 0));
        Map<Long, List<LabRepository.LabLevelCost>> costs = Map.of(
                1L, List.of(cost(1, 1000, 100.0)));

        Map<Long, LabRepository.LabLevelCost> result =
                ShortestLabUtil.computeShortestLabsToMax(labs, costs, NO_MULTIPLIERS, 30, 2.0);

        assertEquals(500, result.get(1L).durationSeconds());
    }

    @Test
    void excludesLabsExceedingMaxDuration() {
        List<LabRepository.LabData> labs = List.of(lab(1, 0), lab(2, 0));
        Map<Long, List<LabRepository.LabLevelCost>> costs = Map.of(
                1L, List.of(cost(1, java.util.concurrent.TimeUnit.DAYS.toSeconds(1), 10.0)),
                2L, List.of(cost(1, java.util.concurrent.TimeUnit.DAYS.toSeconds(5), 10.0)));

        Map<Long, LabRepository.LabLevelCost> result =
                ShortestLabUtil.computeShortestLabsToMax(labs, costs, NO_MULTIPLIERS, 2, 1.0);

        assertTrue(result.containsKey(1L));
        assertFalse(result.containsKey(2L));
    }

    @Test
    void includesLabExactlyAtMaxDurationBoundary() {
        List<LabRepository.LabData> labs = List.of(lab(1, 0));
        Map<Long, List<LabRepository.LabLevelCost>> costs = Map.of(
                1L, List.of(cost(1, java.util.concurrent.TimeUnit.DAYS.toSeconds(2), 10.0)));

        Map<Long, LabRepository.LabLevelCost> result =
                ShortestLabUtil.computeShortestLabsToMax(labs, costs, NO_MULTIPLIERS, 2, 1.0);

        assertTrue(result.containsKey(1L));
    }

    @Test
    void labAlreadyAtMaxLevelIsExcludedFromResult() {
        List<LabRepository.LabData> labs = List.of(lab(1, 5));
        Map<Long, List<LabRepository.LabLevelCost>> costs = Map.of(
                1L, List.of(cost(1, 100, 10.0), cost(2, 100, 10.0)));

        Map<Long, LabRepository.LabLevelCost> result =
                ShortestLabUtil.computeShortestLabsToMax(labs, costs, NO_MULTIPLIERS, 0, 1.0);

        assertFalse(result.containsKey(1L));
    }

    @Test
    void sumIncludesFinalLevelCostThroughMaxLevel() {
        // Regression: reaching a lab's max level must include the cost row where level == maxLevel,
        // not stop one short of it (Wall Invincibility: maxLevel=10, currentLevel=0, costs for levels 1-10).
        List<LabRepository.LabData> labs = List.of(lab(1, 0));
        Map<Long, List<LabRepository.LabLevelCost>> costs = Map.of(
                1L, List.of(
                        cost(1, 100, 10.0),
                        cost(2, 200, 20.0),
                        cost(10, 900, 90.0)
                ));

        Map<Long, LabRepository.LabLevelCost> result =
                ShortestLabUtil.computeShortestLabsToMax(labs, costs, NO_MULTIPLIERS, 30, 1.0);

        LabRepository.LabLevelCost total = result.get(1L);
        assertEquals(10, total.level());
        assertEquals(1200, total.durationSeconds());
        assertEquals(120.0, total.coinCost());
    }
}
