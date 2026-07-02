package com.pphi.tower.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.module.SimpleModule;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.pphi.tower.fixtures.BattleHistoryFixtures;
import com.pphi.tower.jackson.BattleHistoryDeserializer;
import com.pphi.tower.model.battlehistory.BattleHistory;
import com.pphi.tower.repository.RunRepository;
import com.pphi.tower.repository.RunRepository.RunPayloadRow;
import com.pphi.tower.web.dto.IncomeTrendDto;
import com.pphi.tower.web.dto.IncomeTrendDto.TrendPointDto;
import com.pphi.tower.web.dto.RunFilterOptionsDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class IncomeTrendServiceTest {

    @Mock
    private RunRepository repository;

    private ObjectMapper mapper;
    private IncomeTrendService service;

    @BeforeEach
    void setUp() {
        mapper = new ObjectMapper().registerModule(new JavaTimeModule());
        SimpleModule m = new SimpleModule();
        m.addDeserializer(BattleHistory.class, new BattleHistoryDeserializer());
        mapper.registerModule(m);
        service = new IncomeTrendService(repository, mapper);
    }

    // ── day clamping ─────────────────────────────────────────────────────────

    @Test
    void getIncomeTrend_clamps_belowMin_to7() {
        when(repository.findByDateWindowWithFilters(any(), any(), any(), any())).thenReturn(List.of());
        IncomeTrendDto dto = service.getIncomeTrend(1, null, null);
        assertThat(dto.windowDays()).isEqualTo(7);
    }

    @Test
    void getIncomeTrend_clamps_aboveMax_to90() {
        when(repository.findByDateWindowWithFilters(any(), any(), any(), any())).thenReturn(List.of());
        IncomeTrendDto dto = service.getIncomeTrend(365, null, null);
        assertThat(dto.windowDays()).isEqualTo(90);
    }

    @Test
    void getIncomeTrend_nullDays_defaultsTo30() {
        when(repository.findByDateWindowWithFilters(any(), any(), any(), any())).thenReturn(List.of());
        IncomeTrendDto dto = service.getIncomeTrend(null, null, null);
        assertThat(dto.windowDays()).isEqualTo(30);
    }

    @Test
    void getIncomeTrend_inRange_unchanged() {
        when(repository.findByDateWindowWithFilters(any(), any(), any(), any())).thenReturn(List.of());
        IncomeTrendDto dto = service.getIncomeTrend(45, null, null);
        assertThat(dto.windowDays()).isEqualTo(45);
    }

    // ── empty result ─────────────────────────────────────────────────────────

    @Test
    void getIncomeTrend_emptyRepo_returnsEmptyPoints() {
        when(repository.findByDateWindowWithFilters(any(), any(), any(), any())).thenReturn(List.of());
        IncomeTrendDto dto = service.getIncomeTrend(30, null, null);
        assertThat(dto.runsAnalyzed()).isZero();
        assertThat(dto.dataPoints()).isEmpty();
    }

    // ── filter pass-through ──────────────────────────────────────────────────

    @Test
    void getIncomeTrend_passesTierAndRunTypeFiltersToRepository() {
        when(repository.findByDateWindowWithFilters(any(), any(), any(), any())).thenReturn(List.of());
        List<Integer> tiers = List.of(8, 9);
        List<String> runTypes = List.of("Farming", "Event");

        service.getIncomeTrend(30, tiers, runTypes);

        ArgumentCaptor<LocalDate> from = ArgumentCaptor.forClass(LocalDate.class);
        ArgumentCaptor<LocalDate> to = ArgumentCaptor.forClass(LocalDate.class);
        verify(repository).findByDateWindowWithFilters(from.capture(), to.capture(), eq(tiers), eq(runTypes));
        assertThat(from.getValue()).isBefore(to.getValue());
    }

    // ── payload parsing ──────────────────────────────────────────────────────

    @Test
    void getIncomeTrend_parsesCoinsAndCellsFromPayload() throws Exception {
        String payload = mapper.writeValueAsString(BattleHistoryFixtures.unknownVariance());
        RunPayloadRow row = new RunPayloadRow("r1", "2026-06-01", 1_800_000_000L, 8, "Farming", payload);
        when(repository.findByDateWindowWithFilters(any(), any(), any(), any())).thenReturn(List.of(row));

        IncomeTrendDto dto = service.getIncomeTrend(30, null, null);

        assertThat(dto.runsAnalyzed()).isEqualTo(1);
        TrendPointDto point = dto.dataPoints().get(0);
        assertThat(point.id()).isEqualTo("r1");
        assertThat(point.tier()).isEqualTo(8);
        assertThat(point.runType()).isEqualTo("Farming");
        assertThat(point.cellsEarned()).isEqualTo(10.0);
        assertThat(point.cellsPerHour()).isEqualTo(5.0);
        assertThat(point.coinsEarned()).isGreaterThan(0.0);
        assertThat(point.coinsPerHour()).isGreaterThan(0.0);
    }

    @Test
    void getIncomeTrend_malformedPayload_isSkipped() {
        RunPayloadRow good = new RunPayloadRow("r1", "2026-06-01", 1_800_000_000L, 8, "Farming",
                serializeHistory());
        RunPayloadRow bad = new RunPayloadRow("r2", "2026-06-02", 1_800_100_000L, 8, "Farming",
                "not valid json");
        when(repository.findByDateWindowWithFilters(any(), any(), any(), any()))
                .thenReturn(List.of(good, bad));

        IncomeTrendDto dto = service.getIncomeTrend(30, null, null);

        assertThat(dto.runsAnalyzed()).isEqualTo(1);
        assertThat(dto.dataPoints().get(0).id()).isEqualTo("r1");
    }

    // ── filter options ───────────────────────────────────────────────────────

    @Test
    void getFilterOptions_delegatesToRepository() {
        when(repository.findDistinctTiers()).thenReturn(List.of(7, 8, 9));
        when(repository.findDistinctRunTypes()).thenReturn(List.of("Farming", "Tournament"));

        RunFilterOptionsDto options = service.getFilterOptions();

        assertThat(options.tiers()).containsExactly(7, 8, 9);
        assertThat(options.runTypes()).containsExactly("Farming", "Tournament");
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private String serializeHistory() {
        try {
            return mapper.writeValueAsString(BattleHistoryFixtures.unknownVariance());
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
