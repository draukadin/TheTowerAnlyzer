package com.pphi.tower.util;

import com.pphi.tower.repository.LabRepository;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

public final class ShortestLabUtil {

    private ShortestLabUtil() { }

    public static Map<Long, LabRepository.LabLevelCost> computeShortestLabsToMax(
            final List<LabRepository.LabData> labs,
            final Map<Long, List<LabRepository.LabLevelCost>> costs,
            final LabRepository.LabMultipliers multipliers,
            final int maxDurationDays,
            final double cellSpeedMulti) {
        final Map<Long, List<LabRepository.LabLevelCost>> filteredCosts = filterOutCompletedLabLevels(labs, costs);
        return filterLabsByMaxDuration(applyMultipliers(filteredCosts, multipliers, cellSpeedMulti), maxDurationDays);
    }

    private static Map<Long, List<LabRepository.LabLevelCost>> filterOutCompletedLabLevels(
            final List<LabRepository.LabData> labs,
            final Map<Long, List<LabRepository.LabLevelCost>> labCostsMap) {
        final Map<Long, List<LabRepository.LabLevelCost>> filteredCosts = new HashMap<>();
        labs.forEach(lab -> {
            final long labId = lab.id();
            final int currentLevel = lab.currentLevel();
            final List<LabRepository.LabLevelCost> labCosts = labCostsMap.get(labId);
            final List<LabRepository.LabLevelCost> remaining = labCosts.stream()
                    .filter(e -> e.level() > currentLevel)
                    .toList();
            if (!remaining.isEmpty()) {
                filteredCosts.put(labId, remaining);
            }
        });
        return filteredCosts;
    }

    private static Map<Long, LabRepository.LabLevelCost> applyMultipliers(
            final Map<Long, List<LabRepository.LabLevelCost>> filteredCosts,
            final LabRepository.LabMultipliers multipliers,
            final double cellSpeedMulti) {
        final Map<Long, LabRepository.LabLevelCost> map = new HashMap<>();
        for (Map.Entry<Long, List<LabRepository.LabLevelCost>> entry : filteredCosts.entrySet()) {
            final long labId = entry.getKey();
            map.put(labId, reduce(entry.getValue(), multipliers, cellSpeedMulti));
        }
        return map;
    }

    private static LabRepository.LabLevelCost reduce(
            final List<LabRepository.LabLevelCost> values,
            final LabRepository.LabMultipliers multipliers,
            final double cellSpeedMulti) {
        LabRepository.LabLevelCost totalCost = values.stream().reduce(
                new LabRepository.LabLevelCost(0, 0L, 0.0),
                (acc, current) -> new LabRepository.LabLevelCost(
                        Math.max(acc.level(), current.level()),
                        acc.durationSeconds() + current.durationSeconds(),
                        acc.coinCost() + current.coinCost()
                ));

        return new LabRepository.LabLevelCost(
                totalCost.level(),
                Math.round(totalCost.durationSeconds() / (multipliers.speedMult() * cellSpeedMulti)),
                totalCost.coinCost() * multipliers.costMult());
    }

    private static Map<Long, LabRepository.LabLevelCost> filterLabsByMaxDuration(
            final Map<Long, LabRepository.LabLevelCost> labs,
            final int maxDurationDays) {
        final Map<Long, LabRepository.LabLevelCost> filteredLabsByMaxDuration = new HashMap<>();
        final long maxSeconds = TimeUnit.DAYS.toSeconds(maxDurationDays);
        for (Map.Entry<Long, LabRepository.LabLevelCost> entry : labs.entrySet()) {
            if (entry.getValue().durationSeconds() <= maxSeconds) {
                filteredLabsByMaxDuration.put(entry.getKey(), entry.getValue());
            }
        }
        return filteredLabsByMaxDuration;
    }
}
