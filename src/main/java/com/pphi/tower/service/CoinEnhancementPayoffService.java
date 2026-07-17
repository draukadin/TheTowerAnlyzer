package com.pphi.tower.service;

import com.pphi.tower.repository.RunRepository;
import com.pphi.tower.repository.WorkshopRepository;
import com.pphi.tower.repository.WorkshopRepository.WorkshopItem;
import com.pphi.tower.repository.WorkshopRepository.WorkshopLevelCost;
import com.pphi.tower.web.dto.EnhancementPaybackDto;
import com.pphi.tower.web.dto.ReportSummaryDto;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.time.LocalDate;
import java.util.List;

/**
 * Answers "if I buy N levels of Coin Enhancement (Workshop+ 'Coin Bonus +'), how long until the
 * extra coin income pays back the coin cost?" The marginal-multiplier ratio approach is exact
 * regardless of the other 8 Coin Bonus factors (they cancel out), so this doesn't depend on the
 * tier-multiplier table or module substat curve being fully seeded.
 */
@Service
public class CoinEnhancementPayoffService {

    private static final String COIN_ENHANCEMENT_ITEM_NAME = "Coin Bonus +";
    private static final int MIN_DAYS = 7;
    private static final int MAX_DAYS = 90;
    private static final int DEFAULT_DAYS = 30;

    private final WorkshopRepository workshopRepository;
    private final RunRepository runRepository;

    public CoinEnhancementPayoffService(WorkshopRepository workshopRepository, RunRepository runRepository) {
        this.workshopRepository = workshopRepository;
        this.runRepository = runRepository;
    }

    public EnhancementPaybackDto computePayback(int levelsToAdd, Integer requestedDays) {
        if (levelsToAdd <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "levels must be positive");
        }

        WorkshopItem item = workshopRepository.getAll().stream()
                .filter(i -> i.isPlus() && COIN_ENHANCEMENT_ITEM_NAME.equals(i.name()))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Workshop+ item not found: " + COIN_ENHANCEMENT_ITEM_NAME));

        int currentLevel = item.currentLevel();
        int newLevel = Math.min(item.maxLevel(), currentLevel + levelsToAdd);

        double discount = workshopRepository.getDiscounts().plusUtilityCostMult();
        double cost = discount * workshopRepository.getCosts(item.id()).stream()
                .filter(c -> c.level() > currentLevel && c.level() <= newLevel)
                .mapToDouble(WorkshopLevelCost::baseCost)
                .sum();

        double oldMultiplier = valueOrBaseline(item.id(), currentLevel);
        double newMultiplier = valueOrBaseline(item.id(), newLevel);

        double baselineCoinsPerHour = averageCoinsPerHour(clampDays(requestedDays));
        double additionalCoinsPerHour = baselineCoinsPerHour * (newMultiplier / oldMultiplier - 1.0);

        Double paybackHours = additionalCoinsPerHour > 0 ? cost / additionalCoinsPerHour : null;
        Double paybackDays = paybackHours != null ? paybackHours / 24.0 : null;

        return new EnhancementPaybackDto(
                currentLevel, newLevel, cost, oldMultiplier, newMultiplier,
                baselineCoinsPerHour, additionalCoinsPerHour, paybackHours, paybackDays);
    }

    /** workshop_item_level_value has no row for level 0 gaps; a multiplier stat's baseline is 1.0. */
    private double valueOrBaseline(long itemId, int level) {
        double value = workshopRepository.getValue(itemId, level);
        return value != 0.0 ? value : 1.0;
    }

    private double averageCoinsPerHour(int days) {
        LocalDate to = LocalDate.now();
        LocalDate from = to.minusDays(days);
        List<ReportSummaryDto> runs = runRepository.findFarmingAndEventByDateWindow(from, to);
        return runs.stream().mapToDouble(ReportSummaryDto::coinsPerHour).average().orElse(0.0);
    }

    private int clampDays(Integer requested) {
        int value = requested != null ? requested : DEFAULT_DAYS;
        return Math.max(MIN_DAYS, Math.min(MAX_DAYS, value));
    }
}
