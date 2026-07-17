package com.pphi.tower.web.dto;

public record EnhancementPaybackDto(
        int currentLevel,
        int newLevel,
        double cost,
        double oldMultiplier,
        double newMultiplier,
        double baselineCoinsPerHour,
        double additionalCoinsPerHour,
        Double paybackHours,
        Double paybackDays) {}
