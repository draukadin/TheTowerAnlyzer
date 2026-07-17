package com.pphi.tower.util;

import com.pphi.tower.model.DissonanceType;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

public final class DissonanceBoostUtility {

    private static final int MAX_WAVES = 5000;
    private static final double BASE_ECHO_RATE = 0.005;
    private static final int ONE = 1;

    /**
     * Controls how quickly the dissonance bonus scales up.
     * The deeper into the wave count you get the higher the dissonance bonus.
     */
    public static final double DEPTH_CURVE = 1.75;

    private DissonanceBoostUtility() {}

    public static BigDecimal compute(
            final int tierPersonalBest,
            final List<Integer> tiersPersonalBest,
            final int echoLevel,
            final DissonanceType dissonanceType) {
        return BigDecimal.valueOf(computeRaw(tierPersonalBest, tiersPersonalBest, echoLevel, dissonanceType))
                .setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * Same computation as {@link #compute}, without rounding to 2 decimal places. Callers that
     * multiply this value into a larger product (e.g. {@code CoinBonusService}'s Total Bonus)
     * should use this instead of {@link #compute} — rounding here first and multiplying the rounded
     * result compounds error into the total, the same way the game keeps full precision internally
     * and only rounds each factor for display.
     */
    public static double computeRaw(
            final int tierPersonalBest,
            final List<Integer> tiersPersonalBest,
            final int echoLevel,
            final DissonanceType dissonanceType) {
        final double current = waveToBonus(tierPersonalBest);
        final double others = tiersPersonalBest.stream().mapToDouble(DissonanceBoostUtility::waveToBonus).sum() - current;
        final int coefficient = dissonanceType.multiplier() - ONE;
        return ONE + coefficient * (others * ((echoLevel + ONE) * BASE_ECHO_RATE) + current);
    }

    private static double waveToBonus(final int waves) {
        return Math.pow(Math.min(MAX_WAVES, waves) / (double) MAX_WAVES, DEPTH_CURVE);
    }
}
