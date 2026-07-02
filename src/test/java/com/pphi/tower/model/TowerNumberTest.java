package com.pphi.tower.model;

import com.pphi.tower.fixtures.TowerNumberFactory;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class TowerNumberTest {

    // ── toString ────────────────────────────────────────────────────────────

    @Test
    void toString_withSuffix() {
        var n = TowerNumberFactory.of(1.5, ScaleSuffix.TRILLION);
        assertThat(n.toString()).isEqualTo("1.5T");
    }

    @Test
    void toString_noSuffix() {
        var n = new TowerNumber(BigDecimal.valueOf(500), null);
        assertThat(n.toString()).isEqualTo("500");
    }

    @Test
    void toString_zero_noSuffix() {
        assertThat(TowerNumberFactory.zero().toString()).isEqualTo("0.00");
    }

    @Test
    void toString_zero_withSuffix() {
        var n = new TowerNumber(BigDecimal.ZERO, ScaleSuffix.MILLION);
        assertThat(n.toString()).isEqualTo("0.00M");
    }

    // ── toDouble ────────────────────────────────────────────────────────────

    @Test
    void toDouble_withSuffix() {
        var n = TowerNumberFactory.of(1.5, ScaleSuffix.MILLION);
        assertThat(n.toDouble()).isEqualTo(1_500_000.0);
    }

    @Test
    void toDouble_noSuffix() {
        var n = new TowerNumber(BigDecimal.valueOf(500), null);
        assertThat(n.toDouble()).isEqualTo(500.0);
    }

    @Test
    void toDouble_zero() {
        assertThat(TowerNumberFactory.zero().toDouble()).isEqualTo(0.0);
    }

    // ── minus: same suffix ──────────────────────────────────────────────────

    @Test
    void minus_sameSuffix_positive() {
        var a = TowerNumberFactory.of(5.0, ScaleSuffix.TRILLION);
        var b = TowerNumberFactory.of(2.0, ScaleSuffix.TRILLION);
        var result = a.minus(b);
        assertThat(result.scaleSuffix()).isEqualTo(ScaleSuffix.TRILLION);
        assertThat(result.amount()).isEqualByComparingTo("3");
    }

    @Test
    void minus_sameSuffix_toZero() {
        var a = TowerNumberFactory.of(3.0, ScaleSuffix.MILLION);
        var b = TowerNumberFactory.of(3.0, ScaleSuffix.MILLION);
        var result = a.minus(b);
        assertThat(result.amount()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(result.scaleSuffix()).isNull();
    }

    // ── minus: cross-suffix ─────────────────────────────────────────────────

    @Test
    void minus_crossSuffix_downgrades() {
        // 1T - 999B = 1B
        var a = TowerNumberFactory.of(1.0, ScaleSuffix.TRILLION);
        var b = TowerNumberFactory.of(999.0, ScaleSuffix.BILLION);
        var result = a.minus(b);
        assertThat(result.scaleSuffix()).isEqualTo(ScaleSuffix.BILLION);
        assertThat(result.amount()).isEqualByComparingTo("1");
    }

    @Test
    void minus_crossSuffix_differentMagnitudes() {
        // 2T - 1M = still T-range
        var a = TowerNumberFactory.of(2.0, ScaleSuffix.TRILLION);
        var b = TowerNumberFactory.of(1.0, ScaleSuffix.MILLION);
        var result = a.minus(b);
        assertThat(result.scaleSuffix()).isEqualTo(ScaleSuffix.TRILLION);
    }

    // ── minus: negative result ──────────────────────────────────────────────

    @Test
    void minus_negative_result() {
        var a = TowerNumberFactory.of(1.0, ScaleSuffix.BILLION);
        var b = TowerNumberFactory.of(2.0, ScaleSuffix.BILLION);
        var result = a.minus(b);
        assertThat(result.amount()).isLessThan(BigDecimal.ZERO);
        assertThat(result.scaleSuffix()).isEqualTo(ScaleSuffix.BILLION);
    }

    // ── minus: null suffix (small numbers) ─────────────────────────────────

    @Test
    void minus_nullSuffix_both() {
        var a = new TowerNumber(BigDecimal.valueOf(700), null);
        var b = new TowerNumber(BigDecimal.valueOf(200), null);
        var result = a.minus(b);
        // 500 is less than 1000 (THOUSAND), so suffix stays null
        assertThat(result.scaleSuffix()).isNull();
        assertThat(result.amount()).isEqualByComparingTo("500");
    }

    @Test
    void minus_nullSuffix_crossesBoundaryUp() {
        // 900 - (-200) would be cross-boundary; just test subtraction produces correct suffix
        var a = new TowerNumber(BigDecimal.valueOf(1500), null);
        var b = new TowerNumber(BigDecimal.valueOf(200), null);
        var result = a.minus(b);
        // 1300 >= 1000 → THOUSAND suffix
        assertThat(result.scaleSuffix()).isEqualTo(ScaleSuffix.THOUSAND);
    }

    // ── minus: zero inputs ──────────────────────────────────────────────────

    @Test
    void minus_subtractZero_unchanged() {
        var a = TowerNumberFactory.of(5.0, ScaleSuffix.TRILLION);
        var zero = TowerNumberFactory.zero();
        var result = a.minus(zero);
        assertThat(result.scaleSuffix()).isEqualTo(ScaleSuffix.TRILLION);
        assertThat(result.amount()).isEqualByComparingTo("5");
    }

    @Test
    void minus_fromZero_negative() {
        var zero = TowerNumberFactory.zero();
        var b = TowerNumberFactory.of(3.0, ScaleSuffix.BILLION);
        var result = zero.minus(b);
        assertThat(result.amount()).isLessThan(BigDecimal.ZERO);
        assertThat(result.scaleSuffix()).isEqualTo(ScaleSuffix.BILLION);
    }
}