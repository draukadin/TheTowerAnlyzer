package com.pphi.tower.repository;

import com.pphi.tower.model.TowerEra;
import com.pphi.tower.web.dto.ReportSummaryDto;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public class RunRepository {

    private final JdbcTemplate jdbc;

    public RunRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<ReportSummaryDto> SUMMARY_MAPPER = (rs, rowNum) -> {
        long tournamentIdRaw = rs.getLong("tournament_id");
        Long tournamentId = rs.wasNull() ? null : tournamentIdRaw;
        return new ReportSummaryDto(
                rs.getString("id"),
                rs.getInt("run_number"),
                rs.getString("filename"),
                rs.getString("run_type"),
                rs.getString("dissonance_type"),
                rs.getString("battle_date"),
                rs.getInt("tier"),
                rs.getInt("wave"),
                TowerEra.parse(rs.getString("tower_era")),
                rs.getString("killed_by"),
                rs.getDouble("cells_earned"),
                rs.getDouble("cells_per_hour"),
                rs.getDouble("coins_per_hour"),
                rs.getLong("real_time_seconds"),
                rs.getLong("game_time_seconds"),
                rs.getLong("battle_epoch_seconds"),
                tournamentId);
    };

    public static String computeContentHash(long epochSeconds, long realTimeSeconds, long gameTimeSeconds, int tier, int wave) {
        try {
            String input = epochSeconds + "|" + realTimeSeconds + "|" + gameTimeSeconds + "|" + tier + "|" + wave;
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    public boolean existsById(String id) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM runs WHERE id = ?", Integer.class, id);
        return count != null && count > 0;
    }

    public boolean existsByContentHash(String contentHash) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM runs WHERE content_hash = ?", Integer.class, contentHash);
        return count != null && count > 0;
    }

    public void insert(String id, String filename, String runType, String dissonanceType,
                       String battleDate,
                       int tier, int wave, double cellsEarned, long realTimeSeconds,
                       long gameTimeSeconds, double cellsPerHour, double coinsPerHour,
                       String killedBy, TowerEra towerEra, String payloadJson,
                       long battleEpochSeconds) {
        String contentHash = computeContentHash(battleEpochSeconds, realTimeSeconds, gameTimeSeconds, tier, wave);
        jdbc.update("""
                INSERT INTO runs (id, filename, run_type, dissonance_type, battle_date, tier, wave,
                    cells_earned, real_time_seconds, game_time_seconds,
                    cells_per_hour, coins_per_hour, killed_by, tower_era, payload,
                    battle_epoch_seconds, run_number, content_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                    (SELECT COALESCE(MAX(run_number), 0) + 1 FROM runs), ?)
                """,
                id, filename, runType, dissonanceType, battleDate, tier, wave,
                cellsEarned, realTimeSeconds, gameTimeSeconds,
                cellsPerHour, coinsPerHour, killedBy,
                towerEra != null ? towerEra.toString() : null,
                payloadJson, battleEpochSeconds, contentHash);
    }

    public Optional<String> findIdByRunNumber(int runNumber) {
        List<String> results = jdbc.query(
                "SELECT id FROM runs WHERE run_number = ?",
                (rs, rowNum) -> rs.getString("id"), runNumber);
        return results.isEmpty() ? Optional.empty() : Optional.of(results.get(0));
    }

    public List<ReportSummaryDto> findAllSummaries() {
        return jdbc.query("SELECT * FROM runs ORDER BY run_number DESC", SUMMARY_MAPPER);
    }

    public Optional<ReportSummaryDto> findSummaryById(String id) {
        List<ReportSummaryDto> rows = jdbc.query(
                "SELECT * FROM runs WHERE id = ?", SUMMARY_MAPPER, id);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public Optional<String> findPayloadById(String id) {
        List<String> results = jdbc.query(
                "SELECT payload FROM runs WHERE id = ?",
                (rs, rowNum) -> rs.getString("payload"), id);
        return results.isEmpty() ? Optional.empty() : Optional.of(results.get(0));
    }

    public List<ReportSummaryDto> findByDateWindow(LocalDate from, LocalDate to) {
        return jdbc.query(
                "SELECT * FROM runs WHERE battle_date >= ? AND battle_date <= ? ORDER BY battle_date ASC",
                SUMMARY_MAPPER,
                from.toString(), to.toString());
    }

    public List<ReportSummaryDto> findFarmingAndEventByDateWindow(LocalDate from, LocalDate to) {
        return jdbc.query(
                """
                SELECT * FROM runs
                WHERE battle_date >= ? AND battle_date <= ?
                  AND LOWER(run_type) IN ('farming', 'event')
                  AND wave >= 200
                ORDER BY battle_date ASC
                """,
                SUMMARY_MAPPER,
                from.toString(), to.toString());
    }

    public record ShardRunRow(
            String id, String battleDate, int tier, int wave,
            TowerEra towerEra, long realTimeSeconds, String payload) {}

    public List<ShardRunRow> findFarmingRunsWithPayload(LocalDate from, LocalDate to) {
        return jdbc.query("""
                SELECT id, battle_date, tier, wave, tower_era, real_time_seconds, payload
                FROM runs
                WHERE battle_date >= ? AND battle_date <= ?
                  AND LOWER(run_type) IN ('farming', 'event')
                  AND wave >= 200
                ORDER BY battle_date ASC
                """,
                (rs, rn) -> new ShardRunRow(
                        rs.getString("id"),
                        rs.getString("battle_date"),
                        rs.getInt("tier"),
                        rs.getInt("wave"),
                        TowerEra.parse(rs.getString("tower_era")),
                        rs.getLong("real_time_seconds"),
                        rs.getString("payload")),
                from.toString(), to.toString());
    }

    public List<ShardRunRow> findAllRunsWithPayload(LocalDate from, LocalDate to) {
        return jdbc.query("""
                SELECT id, battle_date, tier, wave, tower_era, real_time_seconds, payload
                FROM runs
                WHERE battle_date >= ? AND battle_date <= ?
                ORDER BY battle_date ASC
                """,
                (rs, rn) -> new ShardRunRow(
                        rs.getString("id"),
                        rs.getString("battle_date"),
                        rs.getInt("tier"),
                        rs.getInt("wave"),
                        TowerEra.parse(rs.getString("tower_era")),
                        rs.getLong("real_time_seconds"),
                        rs.getString("payload")),
                from.toString(), to.toString());
    }

    public void deleteById(String id) {
        jdbc.update("DELETE FROM runs WHERE id = ?", id);
    }

    public record DuplicateGroup(String contentHash, List<Integer> runNumbers) {}

    public List<DuplicateGroup> findDuplicateGroups() {
        // Find all runs whose content_hash is shared by more than one row, grouped together.
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT content_hash, run_number
                FROM runs
                WHERE content_hash IN (
                    SELECT content_hash FROM runs
                    WHERE content_hash IS NOT NULL
                    GROUP BY content_hash HAVING COUNT(*) > 1
                )
                ORDER BY content_hash, run_number
                """);

        Map<String, List<Integer>> grouped = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String hash = (String) row.get("content_hash");
            int runNum  = ((Number) row.get("run_number")).intValue();
            grouped.computeIfAbsent(hash, k -> new ArrayList<>()).add(runNum);
        }
        return grouped.entrySet().stream()
                .map(e -> new DuplicateGroup(e.getKey(), e.getValue()))
                .toList();
    }

    public record RunPayloadRow(
            String id, String battleDate, long battleEpochSeconds, int tier, String runType, String payload) {}

    public List<RunPayloadRow> findByDateWindowWithFilters(LocalDate from, LocalDate to,
                                                             List<Integer> tiers, List<String> runTypes) {
        StringBuilder sql = new StringBuilder("""
                SELECT id, battle_date, battle_epoch_seconds, tier, run_type, payload
                FROM runs
                WHERE battle_date >= ? AND battle_date <= ?
                """);
        List<Object> params = new ArrayList<>(List.of(from.toString(), to.toString()));

        if (tiers != null && !tiers.isEmpty()) {
            sql.append(" AND tier IN (").append(placeholders(tiers.size())).append(")");
            params.addAll(tiers);
        }
        if (runTypes != null && !runTypes.isEmpty()) {
            sql.append(" AND run_type IN (").append(placeholders(runTypes.size())).append(")");
            params.addAll(runTypes);
        }
        sql.append(" ORDER BY battle_date ASC, battle_epoch_seconds ASC");

        return jdbc.query(sql.toString(),
                (rs, rowNum) -> new RunPayloadRow(
                        rs.getString("id"),
                        rs.getString("battle_date"),
                        rs.getLong("battle_epoch_seconds"),
                        rs.getInt("tier"),
                        rs.getString("run_type"),
                        rs.getString("payload")),
                params.toArray());
    }

    public List<Integer> findDistinctTiers() {
        return jdbc.query("SELECT DISTINCT tier FROM runs ORDER BY tier ASC",
                (rs, rowNum) -> rs.getInt("tier"));
    }

    public List<String> findDistinctRunTypes() {
        return jdbc.query("SELECT DISTINCT run_type FROM runs WHERE run_type IS NOT NULL ORDER BY run_type ASC",
                (rs, rowNum) -> rs.getString("run_type"));
    }

    private static String placeholders(int count) {
        return String.join(",", java.util.Collections.nCopies(count, "?"));
    }

    public List<ReportSummaryDto> findByRunType(String runType) {
        return jdbc.query(
                "SELECT * FROM runs WHERE run_type = ? ORDER BY run_number DESC", SUMMARY_MAPPER, runType);
    }

    public void setTournamentId(String runId, long tournamentId) {
        jdbc.update("UPDATE runs SET tournament_id = ? WHERE id = ?", tournamentId, runId);
    }

    public void clearTournamentId(String runId) {
        jdbc.update("UPDATE runs SET tournament_id = NULL WHERE id = ?", runId);
    }

    /** Override the tower version (game era) recorded for a run. */
    public void setTowerEra(String runId, TowerEra towerEra) {
        jdbc.update("UPDATE runs SET tower_era = ? WHERE id = ?",
                towerEra != null ? towerEra.toString() : null, runId);
    }

}
