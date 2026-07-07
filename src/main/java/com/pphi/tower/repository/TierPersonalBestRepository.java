package com.pphi.tower.repository;

import com.pphi.tower.model.DissonanceType;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public class TierPersonalBestRepository {

    private final JdbcTemplate jdbc;

    public TierPersonalBestRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record TierPb(int tier, int wave, int attackWaves, int defenseWaves, int utilityWaves, int uwWaves) {}

    private static final RowMapper<TierPb> ROW_MAPPER = (rs, i) -> new TierPb(
            rs.getInt("tier"),
            rs.getInt("wave"),
            rs.getInt("attack_waves"),
            rs.getInt("defense_waves"),
            rs.getInt("utility_waves"),
            rs.getInt("uw_waves")
    );

    @Cacheable("tier-pb")
    public List<TierPb> findAll() {
        return jdbc.query("SELECT * FROM tier_personal_best ORDER BY tier", ROW_MAPPER);
    }

    @CacheEvict(value = "tier-pb", allEntries = true)
    public void createTier(int tier) {
        jdbc.update("""
                INSERT INTO tier_personal_best (tier, wave, attack_waves, defense_waves, utility_waves, uw_waves)
                VALUES (?, 0, 0, 0, 0, 0)
                ON CONFLICT(tier) DO NOTHING
                """, tier);
    }

    @CacheEvict(value = "tier-pb", allEntries = true)
    public void updateWave(int tier, int wave) {
        jdbc.update("UPDATE tier_personal_best SET wave = ? WHERE tier = ?", wave, tier);
    }

    @CacheEvict(value = "tier-pb", allEntries = true)
    public void updateDissonanceWaves(int tier, DissonanceType type, int waves) {
        String column = switch (type) {
            case ATTACK -> "attack_waves";
            case DEFENSE -> "defense_waves";
            case UTILITY -> "utility_waves";
            case UW -> "uw_waves";
        };
        jdbc.update("UPDATE tier_personal_best SET " + column + " = ? WHERE tier = ?", waves, tier);
    }

    /** Upserts the tier row, raising {@code wave} only if it exceeds the current personal best. */
    @CacheEvict(value = "tier-pb", allEntries = true)
    public void recordWaveIfGreater(int tier, int wave) {
        jdbc.update("""
                INSERT INTO tier_personal_best (tier, wave)
                VALUES (?, ?)
                ON CONFLICT(tier) DO UPDATE SET wave = MAX(wave, excluded.wave)
                """, tier, wave);
    }

    /** Upserts the tier row, raising the dissonance column for {@code type} only if it exceeds the current personal best. */
    @CacheEvict(value = "tier-pb", allEntries = true)
    public void recordDissonanceWavesIfGreater(int tier, DissonanceType type, int waves) {
        String column = switch (type) {
            case ATTACK -> "attack_waves";
            case DEFENSE -> "defense_waves";
            case UTILITY -> "utility_waves";
            case UW -> "uw_waves";
        };
        jdbc.update("""
                INSERT INTO tier_personal_best (tier, %s)
                VALUES (?, ?)
                ON CONFLICT(tier) DO UPDATE SET %s = MAX(%s, excluded.%s)
                """.formatted(column, column, column, column), tier, waves);
    }
}
