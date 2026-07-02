package com.pphi.tower.service;

import com.pphi.tower.repository.LabRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class LabServiceTest {

    @Mock
    private LabRepository labRepository;

    private LabService service;

    @BeforeEach
    void setUp() {
        service = new LabService(labRepository);
    }

    private static LabRepository.LabData lab(long id, int currentLevel) {
        return new LabRepository.LabData(id, "Lab " + id, "OFFENSE", 10, currentLevel, null, "desc", null);
    }

    private static LabRepository.LabLevelCost cost(int level, long durationSeconds, double coinCost) {
        return new LabRepository.LabLevelCost(level, durationSeconds, coinCost);
    }

    @Test
    void shortestLabsToMax_delegatesToRepositoryAndComputesResult() {
        List<LabRepository.LabData> labs = List.of(lab(1, 0));
        Map<Long, List<LabRepository.LabLevelCost>> costs = Map.of(
                1L, List.of(cost(1, 1000, 100.0)));
        LabRepository.LabMultipliers multipliers =
                new LabRepository.LabMultipliers(1.0, 1.0, 0, 0, 0.0);

        when(labRepository.getAll()).thenReturn(labs);
        when(labRepository.getAllCosts()).thenReturn(costs);
        when(labRepository.getMultipliers()).thenReturn(multipliers);

        Map<Long, LabRepository.LabLevelCost> result = service.shortestLabsToMax(30, 1.0);

        assertThat(result).containsOnlyKeys(1L);
        assertThat(result.get(1L).durationSeconds()).isEqualTo(1000L);
        assertThat(result.get(1L).coinCost()).isEqualTo(100.0);
    }

    @Test
    void shortestLabsToMax_excludesLabsOverMaxDuration() {
        List<LabRepository.LabData> labs = List.of(lab(1, 0), lab(2, 0));
        Map<Long, List<LabRepository.LabLevelCost>> costs = Map.of(
                1L, List.of(cost(1, java.util.concurrent.TimeUnit.DAYS.toSeconds(1), 10.0)),
                2L, List.of(cost(1, java.util.concurrent.TimeUnit.DAYS.toSeconds(10), 10.0)));
        LabRepository.LabMultipliers multipliers =
                new LabRepository.LabMultipliers(1.0, 1.0, 0, 0, 0.0);

        when(labRepository.getAll()).thenReturn(labs);
        when(labRepository.getAllCosts()).thenReturn(costs);
        when(labRepository.getMultipliers()).thenReturn(multipliers);

        Map<Long, LabRepository.LabLevelCost> result = service.shortestLabsToMax(3, 1.0);

        assertThat(result).containsOnlyKeys(1L);
    }

    @Test
    void shortestLabsToMax_emptyLabs_returnsEmptyMap() {
        when(labRepository.getAll()).thenReturn(List.of());
        when(labRepository.getAllCosts()).thenReturn(Map.of());
        when(labRepository.getMultipliers()).thenReturn(
                new LabRepository.LabMultipliers(1.0, 1.0, 0, 0, 0.0));

        Map<Long, LabRepository.LabLevelCost> result = service.shortestLabsToMax(30, 1.0);

        assertThat(result).isEmpty();
    }
}
