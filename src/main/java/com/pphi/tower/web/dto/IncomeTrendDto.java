package com.pphi.tower.web.dto;

import java.util.List;

public record IncomeTrendDto(
        int windowDays,
        int runsAnalyzed,
        List<TrendPointDto> dataPoints) {

    public record TrendPointDto(
            String id,
            String battleDate,
            long battleEpochSeconds,
            int tier,
            String runType,
            double coinsEarned,
            double coinsPerHour,
            double cellsEarned,
            double cellsPerHour) {}
}
