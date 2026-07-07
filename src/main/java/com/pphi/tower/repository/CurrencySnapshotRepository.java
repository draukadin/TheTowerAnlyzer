package com.pphi.tower.repository;

import com.pphi.tower.model.ScaleSuffix;
import com.pphi.tower.model.TowerNumber;
import com.pphi.tower.model.sheets.Currencies;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Repository
public class CurrencySnapshotRepository {

    /**
     * SQLite JDBC's FastDateParser cannot handle Java's ISO_LOCAL_DATE_TIME format
     * ("T" separator, nanosecond precision). We store and query as plain text strings
     * in this format and parse them back with LocalDateTime.parse() on read.
     * ISO format is lexicographically ordered so SQLite string comparison is correct.
     */
    private static final DateTimeFormatter STORE_FMT = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    private final JdbcTemplate jdbc;

    public CurrencySnapshotRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ── Row types ─────────────────────────────────────────────────────────────

    public record Module(String name, String type, int level) {}

    public record CurrencySnapshot(
            LocalDateTime time,
            int cannonShards, int armorShards,
            int generatorShards, int coreShards,
            int rerollShards,
            double coins, int gems, int stones, int medals, double eliteCells,
            int keys, int tokens, int bits, int tournamentTickets, int moduleTickets) {}

    public record ModuleLevelSnapshot(
            LocalDateTime time, String name, String type, int level) {}

    public record SnapshotPair(
            LocalDateTime earlierTime, LocalDateTime laterTime,
            int earlierCannon, int laterCannon,
            int earlierArmor,  int laterArmor,
            int earlierGenerator, int laterGenerator,
            int earlierCore,   int laterCore) {}

    // ── Row mappers ───────────────────────────────────────────────────────────

    private static final RowMapper<CurrencySnapshot> SNAPSHOT_MAPPER = (rs, rn) ->
            new CurrencySnapshot(
                    LocalDateTime.parse(rs.getString("snapshot_time"), STORE_FMT),
                    rs.getInt("cannon_shards"),
                    rs.getInt("armor_shards"),
                    rs.getInt("generator_shards"),
                    rs.getInt("core_shards"),
                    rs.getInt("reroll_shards"),
                    rs.getDouble("coins"),
                    rs.getInt("gems"),
                    rs.getInt("stones"),
                    rs.getInt("medals"),
                    rs.getDouble("elite_cells"),
                    rs.getInt("keys"),
                    rs.getInt("tokens"),
                    rs.getInt("bits"),
                    rs.getInt("tournament_tickets"),
                    rs.getInt("module_tickets"));

    private static final RowMapper<ModuleLevelSnapshot> MODULE_MAPPER = (rs, rn) ->
            new ModuleLevelSnapshot(
                    LocalDateTime.parse(rs.getString("snapshot_time"), STORE_FMT),
                    rs.getString("module_name"),
                    rs.getString("module_type"),
                    rs.getInt("level"));

    // ── Writes ────────────────────────────────────────────────────────────────

    public void saveCurrencySnapshot(LocalDateTime snapshotTime, Currencies currencies) {
        jdbc.update("""
                INSERT INTO currency_snapshots
                (snapshot_time, coins, gems, stones, medals, elite_cells,
                 keys, tokens, bits, tournament_tickets, module_tickets,
                 cannon_shards, armor_shards, generator_shards,
                 core_shards, reroll_shards)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                STORE_FMT.format(snapshotTime),
                toRaw(currencies.coins()),
                currencies.gems(), currencies.stones(), currencies.medals(),
                toRaw(currencies.eliteCells()),
                currencies.keys(), currencies.tokens(), currencies.bits(),
                currencies.tournamentTickets(), currencies.moduleTickets(),
                currencies.cannonShards(), currencies.armorShards(),
                currencies.generatorShards(), currencies.coreShards(),
                currencies.reRollShards());
    }

    public Optional<Currencies> findLatest() {
        List<CurrencySnapshot> rows = jdbc.query("""
                SELECT * FROM currency_snapshots
                ORDER BY snapshot_time DESC
                LIMIT 1
                """, SNAPSHOT_MAPPER);
        if (rows.isEmpty()) return Optional.empty();
        CurrencySnapshot s = rows.get(0);
        return Optional.of(new Currencies(
                fromRaw(s.coins()),
                s.gems(), s.stones(), s.medals(),
                fromRaw(s.eliteCells()),
                s.keys(), s.tokens(), s.bits(),
                s.tournamentTickets(), s.moduleTickets(),
                s.cannonShards(), s.armorShards(),
                s.generatorShards(), s.coreShards(),
                s.rerollShards()));
    }

    public void saveModuleLevelSnapshots(LocalDateTime snapshotTime, List<Module> modules) {
        for (Module m : modules) {
            jdbc.update("""
                    INSERT INTO module_level_snapshots
                    (snapshot_time, module_name, module_type, level)
                    VALUES (?, ?, ?, ?)
                    """,
                    STORE_FMT.format(snapshotTime), m.name(), m.type(), m.level());
        }
    }

    // ── Reads ─────────────────────────────────────────────────────────────────

    public List<SnapshotPair> findSnapshotPairsInWindow(LocalDateTime from, LocalDateTime to) {
        List<CurrencySnapshot> snapshots = jdbc.query("""
                SELECT * FROM currency_snapshots
                WHERE snapshot_time >= ? AND snapshot_time <= ?
                ORDER BY snapshot_time ASC
                """, SNAPSHOT_MAPPER,
                STORE_FMT.format(from), STORE_FMT.format(to));

        List<SnapshotPair> pairs = new ArrayList<>();
        for (int i = 0; i < snapshots.size() - 1; i++) {
            CurrencySnapshot a = snapshots.get(i);
            CurrencySnapshot b = snapshots.get(i + 1);
            pairs.add(new SnapshotPair(
                    a.time(), b.time(),
                    a.cannonShards(),    b.cannonShards(),
                    a.armorShards(),     b.armorShards(),
                    a.generatorShards(), b.generatorShards(),
                    a.coreShards(),      b.coreShards()));
        }
        return pairs;
    }

    public Map<LocalDateTime, List<ModuleLevelSnapshot>> findModuleLevelsBetween(
            LocalDateTime from, LocalDateTime to) {
        return jdbc.query("""
                SELECT * FROM module_level_snapshots
                WHERE snapshot_time >= ? AND snapshot_time <= ?
                ORDER BY snapshot_time ASC
                """, MODULE_MAPPER,
                STORE_FMT.format(from), STORE_FMT.format(to))
                .stream()
                .collect(Collectors.groupingBy(ModuleLevelSnapshot::time));
    }

    public int countSnapshots() {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM currency_snapshots", Integer.class);
        return count != null ? count : 0;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static double toRaw(TowerNumber tn) {
        if (tn == null || tn.amount() == null) return 0.0;
        if (tn.scaleSuffix() == null) return tn.amount().doubleValue();
        return tn.amount().multiply(tn.scaleSuffix().getScientificNotation()).doubleValue();
    }

    public static TowerNumber fromRaw(double raw) {
        BigDecimal value = BigDecimal.valueOf(raw);
        BigDecimal abs = value.abs();
        ScaleSuffix suffix = java.util.Arrays.stream(ScaleSuffix.values())
                .filter(s -> abs.compareTo(s.getScientificNotation()) >= 0)
                .max(Comparator.comparing(ScaleSuffix::getScientificNotation))
                .orElse(null);
        if (suffix == null) return new TowerNumber(value.setScale(2, RoundingMode.HALF_UP), null);
        return new TowerNumber(value.divide(suffix.getScientificNotation(), 2, RoundingMode.HALF_UP)
                .stripTrailingZeros(), suffix);
    }
}
