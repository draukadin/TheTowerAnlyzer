package com.pphi.tower.util;

import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class LabLockUtil {

    private LabLockUtil() { }

    private static final Pattern UNLOCK_PATTERN = Pattern.compile("T(\\d+),W(\\d+)");

    public record UnlockRequirement(int tier, int wave) {}

    /** Parses a {@code lab.unlock} value like {@code "T7,W30"}; null/unrecognized input has no gate. */
    public static UnlockRequirement parseUnlock(String unlock) {
        if (unlock == null) return null;
        Matcher m = UNLOCK_PATTERN.matcher(unlock);
        return m.find() ? new UnlockRequirement(Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2))) : null;
    }

    /**
     * A lab is locked if its tier/wave requirement isn't met, or (for a UW-linked lab) the
     * required Ultimate Weapon isn't unlocked yet.
     */
    public static boolean isLocked(
            String unlock,
            Integer uwId,
            Map<Integer, Integer> bestWaveByTier,
            Map<Integer, Boolean> uwUnlockedByUwId) {
        UnlockRequirement req = parseUnlock(unlock);
        boolean tierWaveMet = req == null || bestWaveByTier.getOrDefault(req.tier(), 0) >= req.wave();
        boolean uwMet = uwId == null || uwUnlockedByUwId.getOrDefault(uwId, false);
        return !(tierWaveMet && uwMet);
    }
}
