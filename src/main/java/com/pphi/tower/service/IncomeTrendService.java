package com.pphi.tower.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pphi.tower.model.battlehistory.BattleHistory;
import com.pphi.tower.model.battlehistory.BattleReport;
import com.pphi.tower.model.battlehistory.SectionHeader;
import com.pphi.tower.repository.RunRepository;
import com.pphi.tower.repository.RunRepository.RunPayloadRow;
import com.pphi.tower.web.dto.IncomeTrendDto;
import com.pphi.tower.web.dto.IncomeTrendDto.TrendPointDto;
import com.pphi.tower.web.dto.RunFilterOptionsDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;

@Service
public class IncomeTrendService {

    private static final Logger log = LoggerFactory.getLogger(IncomeTrendService.class);

    private static final int MIN_DAYS = 7;
    private static final int MAX_DAYS = 90;
    private static final int DEFAULT_DAYS = 30;

    private final RunRepository repository;
    private final ObjectMapper objectMapper;

    public IncomeTrendService(RunRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    public IncomeTrendDto getIncomeTrend(Integer requestedDays, List<Integer> tiers, List<String> runTypes) {
        int days = clampDays(requestedDays);
        LocalDate to = LocalDate.now();
        LocalDate from = to.minusDays(days);

        List<RunPayloadRow> rows = repository.findByDateWindowWithFilters(from, to, tiers, runTypes);

        List<TrendPointDto> points = rows.stream()
                .map(this::toPoint)
                .filter(java.util.Objects::nonNull)
                .toList();

        return new IncomeTrendDto(days, points.size(), points);
    }

    public RunFilterOptionsDto getFilterOptions() {
        return new RunFilterOptionsDto(repository.findDistinctTiers(), repository.findDistinctRunTypes());
    }

    private TrendPointDto toPoint(RunPayloadRow row) {
        try {
            BattleHistory history = objectMapper.readValue(row.payload(), BattleHistory.class);
            BattleReport report = (BattleReport) history.sectionMap().get(SectionHeader.BATTLE_REPORT);
            if (report == null) {
                log.warn("No BattleReport section found in payload for run {}", row.id());
                return null;
            }
            return new TrendPointDto(
                    row.id(), row.battleDate(), row.battleEpochSeconds(), row.tier(), row.runType(),
                    report.coinsEarned().toDouble(), report.coinsPerHour().toDouble(),
                    report.cellsEarned().toDouble(), report.cellsPerHour().toDouble());
        } catch (Exception e) {
            log.warn("Failed to deserialize payload for run {}: {}", row.id(), e.getMessage());
            return null;
        }
    }

    private int clampDays(Integer requested) {
        int value = requested != null ? requested : DEFAULT_DAYS;
        return Math.max(MIN_DAYS, Math.min(MAX_DAYS, value));
    }
}
