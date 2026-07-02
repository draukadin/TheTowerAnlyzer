package com.pphi.tower.model;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.pphi.tower.jackson.TowerNumberDeserializer;
import com.pphi.tower.jackson.TowerNumberSerializer;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Arrays;
import java.util.Comparator;

@JsonSerialize(using = TowerNumberSerializer.class)
@JsonDeserialize(using = TowerNumberDeserializer.class)
public record TowerNumber(BigDecimal amount, ScaleSuffix scaleSuffix) {

    /** Canonical zero — used as the default for stat fields absent from a report. */
    public static final TowerNumber ZERO = new TowerNumber(BigDecimal.ZERO, null);

    public double toDouble() {
        if (amount == null) return 0.0;
        return scaleSuffix == null ? amount.doubleValue() : amount.multiply(scaleSuffix.getScientificNotation()).doubleValue();
    }

    public TowerNumber minus(final TowerNumber subtrahend) {
        // 1. Convert both to raw flat doubles
        BigDecimal minuend = this.amount.multiply(this.scaleSuffix != null ? this.scaleSuffix.getScientificNotation() : BigDecimal.ONE);
        BigDecimal subtrahendRaw = subtrahend.amount.multiply(subtrahend.scaleSuffix != null ? subtrahend.scaleSuffix.getScientificNotation() : BigDecimal.ONE);

        // 2. Perform the subtraction
        BigDecimal difference = minuend.subtract(subtrahendRaw);

        if (difference.compareTo(BigDecimal.ZERO) == 0) {
            return new TowerNumber(BigDecimal.ZERO, null);
        }

        // 3. Find the largest suffix whose scale fits the absolute value
        BigDecimal abs = difference.abs();
        ScaleSuffix matchingSuffix = Arrays.stream(ScaleSuffix.values())
                .filter(suffix -> abs.compareTo(suffix.getScientificNotation()) >= 0)
                .max(Comparator.comparing(ScaleSuffix::getScientificNotation))
                .orElse(null); // Returns null if the absolute value is less than 1,000 (no suffix)

        // 4. Scale the signed difference down to fit the chosen suffix
        BigDecimal finalAmount = difference;
        if (matchingSuffix != null) {
            finalAmount = difference.divide(matchingSuffix.getScientificNotation(), 10, RoundingMode.HALF_UP)
                                    .stripTrailingZeros();
        }

        return new TowerNumber(finalAmount, matchingSuffix);
    }

    @Override
    public String toString() {
        final StringBuilder sb = new StringBuilder();
        if (amount.compareTo(BigDecimal.ZERO) == 0) {
            sb.append("0.00");
        } else {
            sb.append(amount.toPlainString());
        }
        if (scaleSuffix != null) {
            sb.append(scaleSuffix.getSuffix());
        }
        return sb.toString();
    }
}
