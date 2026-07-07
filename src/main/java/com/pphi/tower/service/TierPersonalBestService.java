package com.pphi.tower.service;

import com.pphi.tower.model.DissonanceType;
import com.pphi.tower.repository.TierPersonalBestRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Set;

/**
 * Keeps {@code tier_personal_best} in sync with incoming battle reports: farming, milestone,
 * tournament and event reports raise the tier's {@code wave} PB, while dissonance reports raise
 * the attack/defense/utility/UW column matching the run's dissonance sub-type.
 */
@Service
public class TierPersonalBestService {

    private static final Logger log = LoggerFactory.getLogger(TierPersonalBestService.class);

    private static final Set<String> WAVE_RUN_TYPES = Set.of("farming", "milestone", "tournament", "event");
    private static final String DISSONANCE_RUN_TYPE = "dissonance";

    private final TierPersonalBestRepository repository;

    public TierPersonalBestService(TierPersonalBestRepository repository) {
        this.repository = repository;
    }

    public void recordResult(int tier, String runType, String dissonanceType, int wave) {
        if (runType == null || runType.isBlank()) {
            return;
        }
        String normalizedRunType = runType.trim().toLowerCase();

        if (WAVE_RUN_TYPES.contains(normalizedRunType)) {
            repository.recordWaveIfGreater(tier, wave);
        } else if (DISSONANCE_RUN_TYPE.equals(normalizedRunType)) {
            DissonanceType type = parseDissonanceType(dissonanceType);
            if (type == null) {
                log.warn("Dissonance report for tier {} has no recognizable dissonance type ('{}'); skipping tier PB update",
                        tier, dissonanceType);
                return;
            }
            repository.recordDissonanceWavesIfGreater(tier, type, wave);
        }
    }

    /**
     * Maps the free-text {@code dissonance_type} stored on a run to {@link DissonanceType}.
     * Mobile clients send the display name ("Ultimate Weapon"), while the manual admin UI
     * sends the enum name ("UW") — both must resolve to {@link DissonanceType#UW}.
     */
    private static DissonanceType parseDissonanceType(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        return switch (raw.trim().toLowerCase()) {
            case "attack" -> DissonanceType.ATTACK;
            case "defense" -> DissonanceType.DEFENSE;
            case "utility" -> DissonanceType.UTILITY;
            case "uw", "ultimate weapon" -> DissonanceType.UW;
            default -> null;
        };
    }
}
