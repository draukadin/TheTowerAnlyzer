package com.pphi.tower.service;

import com.pphi.tower.repository.LabRepository;
import com.pphi.tower.util.GemRushCalculator;
import com.pphi.tower.util.ShortestLabUtil;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class LabService {

    private static final double GEM_EFFICIENCY_PER_MAXED_LAB = 0.015;

    private final LabRepository labRepository;

    public LabService(LabRepository labRepository) {
        this.labRepository = labRepository;
    }

    public Map<Long, LabRepository.LabLevelCost> shortestLabsToMax(
            final int maxDurationDays,
            final double cellSpeedMulti) {
        final List<LabRepository.LabData> labs = labRepository.getAll();
        final Map<Long, List<LabRepository.LabLevelCost>> costs = labRepository.getAllCosts();
        final LabRepository.LabMultipliers multipliers = labRepository.getMultipliers();
        return ShortestLabUtil.computeShortestLabsToMax(labs, costs, multipliers, maxDurationDays, cellSpeedMulti);
    }

    /**
     * Gem cost to instantly rush each lab (that has a target level set and isn't
     * already maxed) from its current level to its target, using the current
     * Gem Rush Efficiency multiplier (1.0 + 0.015 per maxed-out lab).
     */
    public Map<Long, Integer> gemRushCosts() {
        final List<LabRepository.LabData> labs = labRepository.getAll();
        final Map<Long, List<LabRepository.LabLevelCost>> costs = labRepository.getAllCosts();
        final LabRepository.LabMultipliers multipliers = labRepository.getMultipliers();
        final List<LabRepository.LabGemMilestone> milestones = labRepository.getGemMilestones();

        final long maxedLabs = labs.stream().filter(l -> l.currentLevel() >= l.maxLevel()).count();
        final double gemEfficiency = 1.0 + maxedLabs * GEM_EFFICIENCY_PER_MAXED_LAB;

        final Map<Long, Integer> result = new HashMap<>();
        for (final LabRepository.LabData lab : labs) {
            if (lab.currentLevel() >= lab.maxLevel()) continue;
            final int target = lab.targetLevel() != null ? lab.targetLevel() : lab.maxLevel();
            if (target <= lab.currentLevel()) continue;

            final List<LabRepository.LabLevelCost> labCosts = costs.get(lab.id());
            if (labCosts == null) continue;

            final long remainingSeconds = Math.round(labCosts.stream()
                    .filter(c -> c.level() > lab.currentLevel() && c.level() <= target)
                    .mapToLong(c -> c.durationSeconds() != null ? c.durationSeconds() : 0L)
                    .sum() / multipliers.speedMult());

            result.put(lab.id(), GemRushCalculator.calculateGemCost(milestones, remainingSeconds, gemEfficiency));
        }
        return result;
    }
}
