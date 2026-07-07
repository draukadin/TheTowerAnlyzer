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

    /**
     * Reverse of {@link #calculateGemCost}: given a gem budget, finds the remaining
     * research time (in days, on the same lab-speed-only baseline as {@code calculateGemCost}'s
     * {@code remainingSeconds}) at or below which a lab becomes affordable to rush.
     *
     * @param milestones    milestone curve, ascending by {@code milestoneDays}/{@code baseGems}
     * @param gemBudget     the maximum gems the player wants to spend
     * @param gemEfficiency the player's Gem Rush Efficiency multiplier (e.g. 1.705)
     * @return target remaining days, or -1 if the inputs are invalid
     */
    public static double calculateTargetDaysForBudget(final List<LabGemMilestone> milestones,
                                                        final int gemBudget,
                                                        final double gemEfficiency) {
        if (gemEfficiency <= 0 || gemBudget <= 0) {
            return -1.0;
        }

        final double targetBaseGems = gemBudget * gemEfficiency;
        if (targetBaseGems >= MAX_BASE_GEMS) {
            return MAX_MILESTONE_DAYS;
        }

        LabGemMilestone lower = milestones.get(0);
        LabGemMilestone upper = null;
        for (LabGemMilestone m : milestones) {
            if (m.baseGems() <= targetBaseGems) {
                lower = m;
            } else {
                upper = m;
                break;
            }
        }

        if (upper == null) {
            return lower.milestoneDays();
        }

        final double gemProgressFactor = (targetBaseGems - lower.baseGems())
                / (upper.baseGems() - lower.baseGems());
        return lower.milestoneDays() + gemProgressFactor * (upper.milestoneDays() - lower.milestoneDays());
    }

    /**
     * Converts a gap between the current and target remaining-days baseline into real-world
     * hours the player must wait, accounting for the lab slot's speed multiplier.
     *
     * @param currentDisplayDays current remaining days on the lab-speed-only baseline
     * @param targetDays         result of {@link #calculateTargetDaysForBudget}
     * @param slotMultiplier     the lab slot's speed multiplier (e.g. 2.0, 3.0, 4.0)
     * @return real-world hours to wait, or 0 if already affordable
     */
    public static double calculateRealWorldHoursToWait(final double currentDisplayDays,
                                                         final double targetDays,
                                                         final double slotMultiplier) {
        if (currentDisplayDays <= targetDays) {
            return 0.0;
        }

        final double displayDaysToBurn = currentDisplayDays - targetDays;
        return (displayDaysToBurn * 24.0) / slotMultiplier;
    }
}
