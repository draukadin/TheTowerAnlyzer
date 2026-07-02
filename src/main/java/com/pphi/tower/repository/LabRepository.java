package com.pphi.tower.repository;

import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public class LabRepository {

    private final JdbcTemplate jdbc;

    public LabRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record LabData(long id, String name, String category, int maxLevel,
                          int currentLevel, Integer targetLevel,
                          String description, String unlock) {}

    public record LabLevelCost(int level, Long durationSeconds, Double coinCost) {}

    public record LabMultipliers(double speedMult, double costMult,
                                  int labsSpeedLevel, int coinDiscountLevel,
                                  double relicLabSpeedBonus) {}

    @Cacheable("labs")
    public List<LabData> getAll() {
        return jdbc.query("""
                SELECT l.id, l.name, l.category, l.max_level,
                       COALESCE(ps.current_level, 0) AS current_level,
                       ps.target_level,
                       l.description,
                       l.unlock
                FROM lab l
                LEFT JOIN lab_player_state ps ON ps.lab_id = l.id
                ORDER BY l.id
                """, LAB_ROW_MAPPER);
    }

    public List<LabData> getByCategory(String category) {
        return jdbc.query("""
                SELECT l.id, l.name, l.category, l.max_level,
                       COALESCE(ps.current_level, 0) AS current_level,
                       ps.target_level,
                       l.description,
                       l.unlock
                FROM lab l
                LEFT JOIN lab_player_state ps ON ps.lab_id = l.id
                WHERE l.category = ?
                ORDER BY l.id
                """, LAB_ROW_MAPPER, category);
    }

    public List<LabData> search(String query) {
        String pattern = "%" + query.toLowerCase() + "%";
        return jdbc.query("""
                SELECT l.id, l.name, l.category, l.max_level,
                       COALESCE(ps.current_level, 0) AS current_level,
                       ps.target_level,
                       l.description,
                       l.unlock
                FROM lab l
                LEFT JOIN lab_player_state ps ON ps.lab_id = l.id
                WHERE LOWER(l.name) LIKE ? OR LOWER(l.description) LIKE ?
                ORDER BY l.id
                """, LAB_ROW_MAPPER, pattern, pattern);
    }

    private static final org.springframework.jdbc.core.RowMapper<LabData> LAB_ROW_MAPPER =
            (rs, i) -> new LabData(
                    rs.getLong("id"),
                    rs.getString("name"),
                    rs.getString("category"),
                    rs.getInt("max_level"),
                    rs.getInt("current_level"),
                    rs.getObject("target_level") != null ? rs.getInt("target_level") : null,
                    rs.getString("description"),
                    rs.getString("unlock")
            );

    @Caching(evict = {
        @CacheEvict(value = "labs", allEntries = true),
        @CacheEvict(value = "lab-multipliers", allEntries = true),
        @CacheEvict(value = "lab-slots", allEntries = true),
        @CacheEvict(value = "workshop-discounts", allEntries = true),
        @CacheEvict(value = "workshop-unlock-progress", allEntries = true)
    })
    public void updateState(long id, int currentLevel, Integer targetLevel) {
        Integer oldLevel = jdbc.queryForObject(
                "SELECT COALESCE(current_level, 0) FROM lab_player_state WHERE lab_id = ?",
                Integer.class, id);

        jdbc.update("""
                INSERT INTO lab_player_state (lab_id, current_level, target_level) VALUES (?,?,?)
                ON CONFLICT(lab_id) DO UPDATE SET
                    current_level = excluded.current_level,
                    target_level  = excluded.target_level
                """, id, currentLevel, targetLevel);

        if (oldLevel != null && currentLevel != oldLevel) {
            String labName = jdbc.queryForObject("SELECT name FROM lab WHERE id = ?", String.class, id);
            jdbc.update("""
                    INSERT INTO pending_version_change (category, entity_name, old_value, new_value)
                    VALUES ('LAB', ?, ?, ?)
                    """, labName, String.valueOf(oldLevel), String.valueOf(currentLevel));

            jdbc.update("""
                    UPDATE lab_slot_plan SET start_level = ?
                    WHERE lab_id = ? AND start_level = ? AND target_level > ?
                    """, currentLevel, id, oldLevel, currentLevel);
        }
    }

    @Cacheable("lab-costs-all")
    public java.util.Map<Long, List<LabLevelCost>> getAllCosts() {
        java.util.Map<Long, List<LabLevelCost>> map = new java.util.HashMap<>();
        jdbc.query("""
                SELECT lab_id, level, duration_seconds, coin_cost
                FROM lab_level_cost
                ORDER BY lab_id, level
                """,
                (rs, i) -> {
                    long labId = rs.getLong("lab_id");
                    map.computeIfAbsent(labId, k -> new java.util.ArrayList<>())
                       .add(new LabLevelCost(
                               rs.getInt("level"),
                               rs.getObject("duration_seconds") != null ? rs.getLong("duration_seconds") : null,
                               rs.getObject("coin_cost") != null ? rs.getDouble("coin_cost") : null));
                    return null;
                });
        return map;
    }

    public List<LabLevelCost> getCosts(long labId) {
        return jdbc.query("""
                SELECT level, duration_seconds, coin_cost
                FROM lab_level_cost
                WHERE lab_id = ?
                ORDER BY level
                """,
                (rs, i) -> new LabLevelCost(
                        rs.getInt("level"),
                        rs.getObject("duration_seconds") != null ? rs.getLong("duration_seconds") : null,
                        rs.getObject("coin_cost") != null ? rs.getDouble("coin_cost") : null
                ), labId);
    }

    @Cacheable("lab-multipliers")
    public LabMultipliers getMultipliers() {
        Integer speedLevel = jdbc.queryForObject(
                "SELECT COALESCE(ps.current_level,0) FROM lab l LEFT JOIN lab_player_state ps ON ps.lab_id=l.id WHERE l.name='Labs Speed'",
                Integer.class);
        Integer discountLevel = jdbc.queryForObject(
                "SELECT COALESCE(ps.current_level,0) FROM lab l LEFT JOIN lab_player_state ps ON ps.lab_id=l.id WHERE l.name='Labs Coin Discount'",
                Integer.class);
        Double relicBonus = jdbc.queryForObject(
                "SELECT COALESCE(SUM(r.bonus_value),0) FROM relic r JOIN relic_player_state rps ON rps.relic_id=r.id WHERE r.bonus_stat='Lab Speed' AND rps.owned=1",
                Double.class);
        int sl = speedLevel != null ? speedLevel : 0;
        int dl = discountLevel != null ? discountLevel : 0;
        double rb = relicBonus != null ? relicBonus : 0.0;
        double speedMult = (1.0 + sl * 0.02) * (1.0 + rb);
        double costMult  = 1.0 - dl * 0.003;
        return new LabMultipliers(speedMult, costMult, sl, dl, rb);
    }

}
