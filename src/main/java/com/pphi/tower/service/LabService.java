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
     * Gem cost to instantly rush each non-maxed lab's currently in-progress level
     * (current level to current level + 1 — a lab can only ever be rushed one
     * level at a time), using the current Gem Rush Efficiency multiplier
     * (1.0 + 0.015 per maxed-out lab).
     */
    public Map<Long, Integer> gemRushCosts() {
        final List<LabRepository.LabData> labs = labRepository.getAll();
        final Map<Long, List<LabRepository.LabLevelCost>> costs = labRepository.getAllCosts();
        final LabRepository.LabMultipliers multipliers = labRepository.getMultipliers();
        final List<LabRepository.LabGemMilestone> milestones = labRepository.getGemMilestones();

        final double gemEfficiency = resolveGemEfficiency(labs);

        final Map<Long, Integer> result = new HashMap<>();
        for (final LabRepository.LabData lab : labs) {
            if (lab.locked()) continue;
            final Long remainingSeconds = nextLevelRemainingSeconds(lab, costs, multipliers);
            if (remainingSeconds == null) continue;

            result.put(lab.id(), GemRushCalculator.calculateGemCost(milestones, remainingSeconds, gemEfficiency));
        }
        return result;
    }

    /**
     * Real-world hours to wait, per lab, until its rush cost drops to or below
     * {@code gemBudget}, given the lab slot speed the lab is researching in.
     * A value of 0 means the lab is already affordable within budget.
     */
    public Map<Long, Double> gemRushWaitTimes(final int gemBudget, final double cellSpeedMulti) {
        if (gemBudget <= 0) {
            return Map.of();
        }

        final List<LabRepository.LabData> labs = labRepository.getAll();
        final Map<Long, List<LabRepository.LabLevelCost>> costs = labRepository.getAllCosts();
        final LabRepository.LabMultipliers multipliers = labRepository.getMultipliers();
        final List<LabRepository.LabGemMilestone> milestones = labRepository.getGemMilestones();

        final double gemEfficiency = resolveGemEfficiency(labs);
        final double targetDays = GemRushCalculator.calculateTargetDaysForBudget(milestones, gemBudget, gemEfficiency);

        final Map<Long, Double> result = new HashMap<>();
        for (final LabRepository.LabData lab : labs) {
            if (lab.locked()) continue;
            final Long remainingSeconds = nextLevelRemainingSeconds(lab, costs, multipliers);
            if (remainingSeconds == null) continue;

            final double currentDays = remainingSeconds / 86_400.0;
            result.put(lab.id(), GemRushCalculator.calculateRealWorldHoursToWait(currentDays, targetDays, cellSpeedMulti));
        }
        return result;
    }

    /**
     * The remaining research-days threshold (on the lab-speed-only baseline) at
     * which a lab's rush cost drops to or below {@code gemBudget} — i.e. the value
     * a lab's own remaining time will show once it becomes affordable within budget.
     * Independent of any particular lab; returns -1 for an invalid budget.
     */
    public double gemRushTargetDays(final int gemBudget) {
        final List<LabRepository.LabData> labs = labRepository.getAll();
        final List<LabRepository.LabGemMilestone> milestones = labRepository.getGemMilestones();
        return GemRushCalculator.calculateTargetDaysForBudget(milestones, gemBudget, resolveGemEfficiency(labs));
    }

    private double resolveGemEfficiency(final List<LabRepository.LabData> labs) {
        final long maxedLabs = labs.stream().filter(l -> l.currentLevel() >= l.maxLevel()).count();
        return 1.0 + maxedLabs * GEM_EFFICIENCY_PER_MAXED_LAB;
    }

    /**
     * Remaining research seconds for a lab's single in-progress level (current + 1),
     * adjusted for lab speed — or null if the lab is maxed or has no cost data for
     * that level. A lab can only ever be gem-rushed one level at a time.
     */
    private Long nextLevelRemainingSeconds(
            final LabRepository.LabData lab,
            final Map<Long, List<LabRepository.LabLevelCost>> costs,
            final LabRepository.LabMultipliers multipliers) {
        if (lab.currentLevel() >= lab.maxLevel()) return null;

        final List<LabRepository.LabLevelCost> labCosts = costs.get(lab.id());
        if (labCosts == null) return null;

        final int nextLevel = lab.currentLevel() + 1;
        final LabRepository.LabLevelCost nextLevelCost = labCosts.stream()
                .filter(c -> c.level() == nextLevel)
                .findFirst()
                .orElse(null);
        if (nextLevelCost == null || nextLevelCost.durationSeconds() == null) return null;

        return Math.round(nextLevelCost.durationSeconds() / multipliers.speedMult());
    }
}
