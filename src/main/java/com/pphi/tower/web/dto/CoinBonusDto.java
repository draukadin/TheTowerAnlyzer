package com.pphi.tower.web.dto;

import java.util.List;

public record CoinBonusDto(
        int tier,
        List<BonusFactorDto> factors,
        double totalBonus) {

    /**
     * One multiplicative factor in the Coin Bonus breakdown. {@code active=false} means this
     * factor is at its baseline/not-owned/not-equipped state — the front end renders that as
     * "Inactive", matching the in-game "All Coins Bonuses" screen, instead of {@code x1.00}.
     */
    public record BonusFactorDto(String label, double multiplier, boolean active) {}
}
