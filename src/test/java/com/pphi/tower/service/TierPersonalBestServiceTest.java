package com.pphi.tower.service;

import com.pphi.tower.model.DissonanceType;
import com.pphi.tower.repository.TierPersonalBestRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

class TierPersonalBestServiceTest {

    private final TierPersonalBestRepository repository = mock(TierPersonalBestRepository.class);
    private final TierPersonalBestService service = new TierPersonalBestService(repository);

    @ParameterizedTest
    @ValueSource(strings = {"farming", "Farming", "MILESTONE", "Tournament", "event"})
    void recordResult_waveRunType_recordsWave(String runType) {
        service.recordResult(8, runType, null, 3000);
        verify(repository).recordWaveIfGreater(8, 3000);
    }

    @ParameterizedTest
    @CsvSource({
            "Attack,ATTACK",
            "Defense,DEFENSE",
            "Utility,UTILITY",
            "UW,UW",
            "Ultimate Weapon,UW",
            "ultimate weapon,UW",
    })
    void recordResult_dissonanceRunType_recordsMappedDissonanceType(String dissonanceType, DissonanceType expected) {
        service.recordResult(8, "Dissonance", dissonanceType, 3000);
        verify(repository).recordDissonanceWavesIfGreater(8, expected, 3000);
    }

    @Test
    void recordResult_dissonanceWithNullSubType_isSkipped() {
        service.recordResult(8, "Dissonance", null, 3000);
        verifyNoInteractions(repository);
    }

    @Test
    void recordResult_dissonanceWithUnrecognizedSubType_isSkipped() {
        service.recordResult(8, "Dissonance", "Bogus", 3000);
        verifyNoInteractions(repository);
    }

    @ParameterizedTest
    @ValueSource(strings = {"Unknown", "wrong-chip"})
    void recordResult_unrecognizedRunType_isSkipped(String runType) {
        service.recordResult(8, runType, null, 3000);
        verifyNoInteractions(repository);
    }

    @Test
    void recordResult_nullRunType_isSkipped() {
        service.recordResult(8, null, null, 3000);
        verifyNoInteractions(repository);
    }
}
