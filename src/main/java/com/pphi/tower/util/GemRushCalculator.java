package com.pphi.tower.util;

import com.pphi.tower.repository.LabRepository.LabGemMilestone;

import java.util.List;

public final class GemRushCalculator {

    private static final double MAX_BASE_GEMS = 25_000.0;
    private static final double MAX_MILESTONE_DAYS = 360.0;
    private static final double SECONDS_PER_DAY = 86_400.0;

    private GemRushCalculator() { }

    /**
     * Computes the gem cost to instantly rush a lab given the remaining research
     * time, using piecewise-linear interpolation over the game's milestone curve,
     * then applying the player's Gem Rush Efficiency multiplier.
     *
     * @param milestones    milestone curve, ascending by {@code milestoneDays}
     * @param remainingSeconds remaining research time
     * @param gemEfficiency the player's Gem Rush Efficiency multiplier (e.g. 1.705)
     */
    public static int calculateGemCost(final List<LabGemMilestone> milestones,
                                        final long remainingSeconds,
                                        final double gemEfficiency) {
        if (gemEfficiency <= 0) {
            throw new IllegalArgumentException("Gem efficiency must be greater than 0");
        }

        final double remainingDays = remainingSeconds / SECONDS_PER_DAY;
        if (remainingDays >= MAX_MILESTONE_DAYS) {
            return (int) Math.ceil(MAX_BASE_GEMS / gemEfficiency);
        }

        LabGemMilestone lower = milestones.get(0);
        LabGemMilestone upper = null;
        for (LabGemMilestone m : milestones) {
            if (m.milestoneDays() <= remainingDays) {
                lower = m;
            } else {
                upper = m;
                break;
            }
        }

        if (upper == null) {
            return (int) Math.ceil(lower.baseGems() / gemEfficiency);
        }

        final double interpolationFactor = (remainingDays - lower.milestoneDays())
                / (upper.milestoneDays() - lower.milestoneDays());
        final double curvedBaseGems = lower.baseGems() + interpolationFactor * (upper.baseGems() - lower.baseGems());
        return (int) Math.ceil(curvedBaseGems / gemEfficiency);
    }
}
