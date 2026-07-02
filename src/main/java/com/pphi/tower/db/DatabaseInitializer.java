package com.pphi.tower.db;

import com.pphi.tower.repository.RunRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

@Component
public class DatabaseInitializer {

    private static final Logger log = LoggerFactory.getLogger(DatabaseInitializer.class);

    private final JdbcTemplate jdbc;

    public DatabaseInitializer(JdbcTemplate jdbc) throws IOException {
        this.jdbc = jdbc;
        ensureDbDirectory();
        createSchema();
    }

    private void ensureDbDirectory() throws IOException {
        String appData = System.getenv("APPDATA");
        Path dir = Path.of(appData, "TheTowerAnalyzer");
        Files.createDirectories(dir);
    }

    private void createSchema() {
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS runs (
                    id                  TEXT PRIMARY KEY,
                    filename            TEXT NOT NULL,
                    run_type            TEXT NOT NULL,
                    battle_date         TEXT NOT NULL,
                    tier                INTEGER NOT NULL,
                    wave                INTEGER NOT NULL,
                    cells_earned        REAL NOT NULL,
                    real_time_seconds   INTEGER NOT NULL,
                    game_time_seconds   INTEGER NOT NULL,
                    cells_per_hour      REAL NOT NULL,
                    coins_per_hour      REAL NOT NULL,
                    killed_by           TEXT,
                    tower_era           TEXT,
                    payload             TEXT NOT NULL
                )
                """);

        // Migration: add battle_epoch_seconds for dead-time gap computation.
        try {
            jdbc.execute("ALTER TABLE runs ADD COLUMN battle_epoch_seconds INTEGER");
        } catch (Exception ignored) {
            // Column already exists — safe to continue.
        }

        // Migration: add dissonance_type for Dissonance run sub-type (Attack/Defense/Utility/UW).
        try {
            jdbc.execute("ALTER TABLE runs ADD COLUMN dissonance_type TEXT");
        } catch (Exception ignored) {
            // Column already exists — safe to continue.
        }

        // Migration: add run_number — a stable user-facing integer identifier.
        try {
            jdbc.execute("ALTER TABLE runs ADD COLUMN run_number INTEGER");
            // Backfill existing rows in chronological order.
            jdbc.execute("""
                    WITH numbered AS (
                        SELECT id,
                               ROW_NUMBER() OVER (ORDER BY COALESCE(battle_epoch_seconds, 0), id) AS rn
                        FROM runs
                    )
                    UPDATE runs SET run_number = (SELECT rn FROM numbered WHERE numbered.id = runs.id)
                    """);
        } catch (Exception ignored) {
            // Column already exists — safe to continue.
        }

        try {
            jdbc.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_run_number ON runs (run_number)");
        } catch (Exception ignored) {}

        // Migration: add content_hash for duplicate-run detection.
        try {
            jdbc.execute("ALTER TABLE runs ADD COLUMN content_hash TEXT");
            backfillContentHashes();
        } catch (Exception ignored) {
            // Column already exists — safe to continue.
        }

        try {
            jdbc.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_content_hash ON runs (content_hash)");
        } catch (Exception e) {
            log.warn("Could not create unique index on runs.content_hash — duplicate runs may exist and should be removed via the UI: {}", e.getMessage());
        }

        // Migration: rehash content_hash using real_time_seconds instead of battle_epoch_seconds.
        // The epoch varies between re-exports of the same run; real_time is stable game data.
        try {
            jdbc.execute("ALTER TABLE runs ADD COLUMN _content_hash_v2_migrated INTEGER DEFAULT 0");
            jdbc.update("UPDATE runs SET content_hash = NULL");
            backfillContentHashes();
        } catch (Exception ignored) {
            // Sentinel column already exists — migration already applied.
        }

        // Migration: drop unique constraint on content_hash so duplicates can co-exist and be
        // surfaced by findDuplicateGroups() rather than silently left with a NULL hash.
        // Import-time dedup is handled by existsByContentHash() pre-check, not the index.
        try {
            jdbc.execute("ALTER TABLE runs ADD COLUMN _content_hash_v3_nonunique INTEGER DEFAULT 0");
            jdbc.execute("DROP INDEX IF EXISTS idx_runs_content_hash");
            jdbc.execute("CREATE INDEX IF NOT EXISTS idx_runs_content_hash ON runs (content_hash)");
            backfillContentHashes();
        } catch (Exception ignored) {
            // Sentinel column already exists — migration already applied.
        }

        // Migration: extend hash key to epoch|realTime|gameTime|tier|wave.
        // Epoch re-introduces per-session uniqueness (eliminates false positives for scripted runs);
        // realTime + gameTime retain specificity for Drive re-share dedup where epoch is stable.
        try {
            jdbc.execute("ALTER TABLE runs ADD COLUMN _content_hash_v4_five_fields INTEGER DEFAULT 0");
            jdbc.update("UPDATE runs SET content_hash = NULL");
            backfillContentHashes();
        } catch (Exception ignored) {
            // Sentinel column already exists — migration already applied.
        }

        jdbc.execute("""
                CREATE INDEX IF NOT EXISTS idx_runs_battle_date
                ON runs (battle_date)
                """);

        jdbc.execute("""
                CREATE INDEX IF NOT EXISTS idx_runs_run_type
                ON runs (run_type)
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS currency_snapshots (
                    id             INTEGER PRIMARY KEY AUTOINCREMENT,
                    snapshot_time  TIMESTAMP NOT NULL,
                    cannon_shards  INTEGER,
                    armor_shards   INTEGER,
                    generator_shards INTEGER,
                    core_shards    INTEGER,
                    reroll_shards  INTEGER,
                    gems           INTEGER,
                    stones         INTEGER,
                    medals         INTEGER,
                    elite_cells    REAL,
                    tokens         INTEGER,
                    bits           INTEGER
                )
                """);

        jdbc.execute("""
                CREATE INDEX IF NOT EXISTS idx_currency_snapshots_time
                ON currency_snapshots (snapshot_time)
                """);

        // Migrations: add currency columns introduced after initial table creation.
        for (String col : new String[]{
                "ADD COLUMN coins              REAL    DEFAULT 0",
                "ADD COLUMN keys               INTEGER DEFAULT 0",
                "ADD COLUMN tournament_tickets INTEGER DEFAULT 0",
                "ADD COLUMN module_tickets     INTEGER DEFAULT 0"
        }) {
            try {
                jdbc.execute("ALTER TABLE currency_snapshots " + col);
            } catch (Exception ignored) {}
        }

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS module_level_snapshots (
                    id            INTEGER PRIMARY KEY AUTOINCREMENT,
                    snapshot_time TIMESTAMP NOT NULL,
                    module_name   TEXT NOT NULL,
                    module_type   TEXT NOT NULL,
                    level         INTEGER NOT NULL
                )
                """);

        jdbc.execute("""
                CREATE INDEX IF NOT EXISTS idx_module_level_snapshots_time
                ON module_level_snapshots (snapshot_time)
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS chat_history (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    report_id_1 TEXT NOT NULL,
                    report_id_2 TEXT NOT NULL,
                    role        TEXT NOT NULL,
                    message     TEXT NOT NULL,
                    created_at  INTEGER NOT NULL
                )
                """);

        jdbc.execute("""
                CREATE INDEX IF NOT EXISTS idx_chat_history_pair
                ON chat_history (report_id_1, report_id_2)
                """);

        // Migration: add thought_signature for Gemini thinking-model multi-turn support.
        try {
            jdbc.execute("ALTER TABLE chat_history ADD COLUMN thought_signature TEXT");
        } catch (Exception ignored) {
            // Column already exists — safe to continue.
        }

        // ── Ultimate Weapons ──────────────────────────────────────────────────

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS uw (
                    id           INTEGER PRIMARY KEY,
                    code         TEXT NOT NULL UNIQUE,
                    name         TEXT NOT NULL,
                    uw_plus_name TEXT NOT NULL
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS uw_stat (
                    id         INTEGER PRIMARY KEY,
                    uw_id      INTEGER NOT NULL REFERENCES uw(id),
                    stat_key   TEXT    NOT NULL,
                    label      TEXT    NOT NULL,
                    max_level  INTEGER NOT NULL,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    UNIQUE(uw_id, stat_key)
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS uw_stat_level_value (
                    uw_stat_id     INTEGER NOT NULL REFERENCES uw_stat(id),
                    level          INTEGER NOT NULL,
                    value          REAL    NOT NULL,
                    stones_to_next INTEGER,
                    PRIMARY KEY (uw_stat_id, level)
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS uw_player_state (
                    uw_id            INTEGER NOT NULL REFERENCES uw(id) PRIMARY KEY,
                    unlocked         INTEGER NOT NULL DEFAULT 0,
                    uw_plus_unlocked INTEGER NOT NULL DEFAULT 0
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS uw_stat_player_level (
                    uw_stat_id    INTEGER NOT NULL REFERENCES uw_stat(id) PRIMARY KEY,
                    current_level INTEGER NOT NULL DEFAULT 0
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS uw_stat_level_history (
                    id         INTEGER  PRIMARY KEY AUTOINCREMENT,
                    uw_stat_id INTEGER  NOT NULL REFERENCES uw_stat(id),
                    old_level  INTEGER  NOT NULL,
                    new_level  INTEGER  NOT NULL,
                    changed_at DATETIME NOT NULL DEFAULT (datetime('now'))
                )
                """);

        jdbc.execute("""
                CREATE INDEX IF NOT EXISTS idx_uw_stat_level_history_stat
                ON uw_stat_level_history (uw_stat_id, changed_at)
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS uw_stat_target_level (
                    uw_stat_id   INTEGER NOT NULL REFERENCES uw_stat(id) PRIMARY KEY,
                    target_level INTEGER NOT NULL DEFAULT 0
                )
                """);

        // ── Modules ───────────────────────────────────────────────────────────

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS module_def (
                    id              INTEGER PRIMARY KEY,
                    code            TEXT    NOT NULL UNIQUE,
                    name            TEXT    NOT NULL,
                    type            TEXT    NOT NULL,
                    effect_template TEXT    NOT NULL,
                    sort_order      INTEGER NOT NULL DEFAULT 0
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS module_ability_value (
                    module_def_id INTEGER NOT NULL REFERENCES module_def(id),
                    rarity        TEXT    NOT NULL,
                    value         TEXT    NOT NULL,
                    PRIMARY KEY (module_def_id, rarity)
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS module_player_state (
                    module_def_id INTEGER NOT NULL REFERENCES module_def(id) PRIMARY KEY,
                    owned         INTEGER NOT NULL DEFAULT 0,
                    rarity        TEXT    NOT NULL DEFAULT 'Epic',
                    stars         INTEGER NOT NULL DEFAULT 0,
                    level         INTEGER NOT NULL DEFAULT 0
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS module_player_substat (
                    id            INTEGER PRIMARY KEY AUTOINCREMENT,
                    module_def_id INTEGER NOT NULL REFERENCES module_def(id),
                    slot_index    INTEGER NOT NULL,
                    substat_key   TEXT    NOT NULL,
                    substat_rarity TEXT   NOT NULL DEFAULT 'Common',
                    locked        INTEGER NOT NULL DEFAULT 0,
                    UNIQUE (module_def_id, slot_index)
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS module_player_copy (
                    id            INTEGER PRIMARY KEY AUTOINCREMENT,
                    module_def_id INTEGER NOT NULL REFERENCES module_def(id),
                    copy_index    INTEGER NOT NULL,
                    copy_rarity   TEXT    NOT NULL,
                    UNIQUE (module_def_id, copy_index)
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS module_player_meta (
                    module_def_id   INTEGER NOT NULL REFERENCES module_def(id) PRIMARY KEY,
                    shattered_epics INTEGER NOT NULL DEFAULT 0
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS module_preset_assignment (
                    preset        TEXT    NOT NULL,
                    slot          TEXT    NOT NULL,
                    module_def_id INTEGER NOT NULL REFERENCES module_def(id),
                    PRIMARY KEY (preset, slot, module_def_id)
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS module_level_cost (
                    level      INTEGER NOT NULL PRIMARY KEY,
                    shard_cost INTEGER NOT NULL,
                    coin_cost  REAL    NOT NULL
                )
                """);

        // ── Relics ────────────────────────────────────────────────────────────

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS relic (
                    id               INTEGER PRIMARY KEY AUTOINCREMENT,
                    name             TEXT    NOT NULL UNIQUE,
                    rarity           TEXT    NOT NULL,
                    type             TEXT    NOT NULL,
                    bonus_stat       TEXT    NOT NULL,
                    bonus_value      REAL    NOT NULL,
                    obtain_condition TEXT    NOT NULL
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS relic_player_state (
                    relic_id INTEGER NOT NULL REFERENCES relic(id) PRIMARY KEY,
                    owned    INTEGER NOT NULL DEFAULT 0
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS gem_store_relic_rotation (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    start_date TEXT    NOT NULL,
                    slot       TEXT    NOT NULL,
                    relic_id   INTEGER NOT NULL REFERENCES relic(id),
                    variant    TEXT    NOT NULL DEFAULT '',
                    UNIQUE(start_date, slot, variant)
                )
                """);

        // ── Labs ──────────────────────────────────────────────────────────────

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS lab (
                    id        INTEGER PRIMARY KEY AUTOINCREMENT,
                    name      TEXT    NOT NULL UNIQUE,
                    category  TEXT    NOT NULL,
                    max_level INTEGER NOT NULL
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS lab_player_state (
                    lab_id        INTEGER NOT NULL REFERENCES lab(id) PRIMARY KEY,
                    current_level INTEGER NOT NULL DEFAULT 0,
                    target_level  INTEGER
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS lab_level_cost (
                    lab_id           INTEGER NOT NULL REFERENCES lab(id),
                    level            INTEGER NOT NULL,
                    duration_seconds INTEGER,
                    coin_cost        REAL,
                    PRIMARY KEY (lab_id, level)
                )
                """);

        // Migrations: add description and unlock columns introduced after initial lab table creation.
        for (String col : new String[]{
                "ADD COLUMN description TEXT",
                "ADD COLUMN unlock      TEXT"
        }) {
            try {
                jdbc.execute("ALTER TABLE lab " + col);
            } catch (Exception ignored) {}
        }

        // ── Lab Slot Planner ──────────────────────────────────────────────────

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS lab_slot (
                    slot_number     INTEGER NOT NULL PRIMARY KEY CHECK(slot_number BETWEEN 1 AND 5),
                    cell_speed_mult REAL    NOT NULL DEFAULT 1.0
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS lab_slot_plan (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    slot_number  INTEGER NOT NULL REFERENCES lab_slot(slot_number),
                    sort_order   INTEGER NOT NULL,
                    lab_id       INTEGER NOT NULL REFERENCES lab(id),
                    start_level  INTEGER NOT NULL,
                    target_level INTEGER NOT NULL
                )
                """);

        for (int s = 1; s <= 5; s++) {
            jdbc.update("INSERT OR IGNORE INTO lab_slot(slot_number) VALUES(?)", s);
        }

        // Migrate coin_cost INTEGER → REAL for values that overflow Long (e.g. Dissonant Echo)
        try {
            boolean isInteger = jdbc.queryForList("PRAGMA table_info(lab_level_cost)").stream()
                    .filter(c -> "coin_cost".equals(c.get("name")))
                    .anyMatch(c -> "INTEGER".equals(c.get("type")));
            if (isInteger) {
                jdbc.execute("DROP TABLE lab_level_cost");
                jdbc.execute("""
                        CREATE TABLE lab_level_cost (
                            lab_id           INTEGER NOT NULL REFERENCES lab(id),
                            level            INTEGER NOT NULL,
                            duration_seconds INTEGER,
                            coin_cost        REAL,
                            PRIMARY KEY (lab_id, level)
                        )
                        """);
            }
        } catch (Exception ignored) {}

        // ── Perk Settings ────────────────────────────────────────────────────

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS perk (
                    id            INTEGER PRIMARY KEY AUTOINCREMENT,
                    name          TEXT    NOT NULL UNIQUE,
                    type          TEXT    NOT NULL CHECK(type IN ('Standard','UW','TradeOff')),
                    max_picks     INTEGER NOT NULL DEFAULT 1,
                    base_value    REAL,
                    value_formula TEXT    CHECK(value_formula IN ('multiplicative','additive')),
                    value_unit    TEXT    CHECK(value_unit IN ('multiplier','percent','flat','seconds')),
                    downside_desc TEXT
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS perk_ban (
                    perk_id INTEGER NOT NULL REFERENCES perk(id) PRIMARY KEY
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS perk_auto_pick_ranking (
                    rank    INTEGER NOT NULL PRIMARY KEY,
                    perk_id INTEGER NOT NULL REFERENCES perk(id)
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS perk_first_choice (
                    id      INTEGER PRIMARY KEY CHECK(id = 1),
                    perk_id INTEGER NOT NULL REFERENCES perk(id)
                )
                """);

        // ── Cosmetics ─────────────────────────────────────────────────────────

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS cosmetic_category (
                    id               TEXT NOT NULL PRIMARY KEY,
                    display_name     TEXT NOT NULL,
                    bonus_per_item   REAL NOT NULL
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS cosmetic_event (
                    id                INTEGER PRIMARY KEY AUTOINCREMENT,
                    name              TEXT    NOT NULL UNIQUE,
                    reroll_multiplier INTEGER NOT NULL DEFAULT 1
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS cosmetic_item (
                    id               INTEGER PRIMARY KEY AUTOINCREMENT,
                    category_id      TEXT    NOT NULL REFERENCES cosmetic_category(id),
                    name             TEXT    NOT NULL,
                    owned            INTEGER NOT NULL DEFAULT 0,
                    event_id         INTEGER REFERENCES cosmetic_event(id),
                    milestone_number INTEGER,
                    milestone_tier   TEXT,
                    milestone_unlock TEXT,
                    UNIQUE(category_id, name)
                )
                """);

        jdbc.execute("""
                CREATE INDEX IF NOT EXISTS idx_cosmetic_item_category
                ON cosmetic_item (category_id)
                """);

        // ── Version History ───────────────────────────────────────────────────

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS tower_version (
                    version TEXT PRIMARY KEY,
                    type    TEXT NOT NULL,
                    summary TEXT NOT NULL DEFAULT ''
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS tower_version_change (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    version     TEXT    NOT NULL REFERENCES tower_version(version),
                    category    TEXT    NOT NULL,
                    entity_name TEXT    NOT NULL,
                    old_value   TEXT,
                    new_value   TEXT    NOT NULL,
                    notes       TEXT
                )
                """);

        jdbc.execute("""
                CREATE INDEX IF NOT EXISTS idx_tower_version_change_version
                ON tower_version_change (version)
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS pending_version_change (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    category    TEXT    NOT NULL,
                    entity_name TEXT    NOT NULL,
                    old_value   TEXT,
                    new_value   TEXT    NOT NULL,
                    notes       TEXT,
                    created_at  DATETIME NOT NULL DEFAULT (datetime('now'))
                )
                """);

        // ── Tier Personal Bests ───────────────────────────────────────────────

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS tier_personal_best (
                    tier           INTEGER PRIMARY KEY,
                    wave           INTEGER NOT NULL DEFAULT 0,
                    attack_waves   INTEGER NOT NULL DEFAULT 0,
                    defense_waves  INTEGER NOT NULL DEFAULT 0,
                    utility_waves  INTEGER NOT NULL DEFAULT 0,
                    uw_waves       INTEGER NOT NULL DEFAULT 0
                )
                """);

        // ── Workshop & Workshop+ ──────────────────────────────────────────────

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS workshop_category (
                    id   INTEGER PRIMARY KEY,
                    name TEXT    NOT NULL UNIQUE
                )
                """);

        // Seed categories if not yet present.
        jdbc.execute("""
                INSERT OR IGNORE INTO workshop_category (id, name) VALUES
                    (1, 'ATTACK'),
                    (2, 'DEFENSE'),
                    (3, 'UTILITY')
                """);

        // One-time flat-fee groups that unlock one or more Workshop (nonplus) items together.
        // Items with unlock_cost = 0 are available immediately.
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS workshop_unlock_group (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    category_id INTEGER NOT NULL REFERENCES workshop_category(id),
                    unlock_cost REAL    NOT NULL DEFAULT 0,
                    UNIQUE (category_id, unlock_cost)
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS workshop_item (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    name        TEXT    NOT NULL,
                    category_id INTEGER NOT NULL REFERENCES workshop_category(id),
                    is_plus     INTEGER NOT NULL DEFAULT 0 CHECK (is_plus IN (0, 1)),
                    sort_order  INTEGER NOT NULL,
                    max_level   INTEGER NOT NULL,
                    unlock_group_id              INTEGER REFERENCES workshop_unlock_group(id),
                    plus_unlock_lab_name         TEXT,
                    plus_unlock_cumulative_spend REAL,
                    UNIQUE (name, is_plus)
                )
                """);

        // REAL because Workshop+ costs reach ~3e20, exceeding INTEGER max (~9.2e18).
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS workshop_item_level_cost (
                    workshop_item_id INTEGER NOT NULL REFERENCES workshop_item(id),
                    level            INTEGER NOT NULL CHECK (level >= 1),
                    base_cost        REAL    NOT NULL,
                    PRIMARY KEY (workshop_item_id, level)
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS workshop_unlock_group_state (
                    unlock_group_id INTEGER NOT NULL REFERENCES workshop_unlock_group(id) PRIMARY KEY,
                    is_purchased    INTEGER NOT NULL DEFAULT 0 CHECK (is_purchased IN (0, 1))
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS workshop_item_state (
                    workshop_item_id INTEGER NOT NULL REFERENCES workshop_item(id) PRIMARY KEY,
                    current_level    INTEGER NOT NULL DEFAULT 0
                )
                """);

        // Migration: add target_level column for persisting per-item upgrade goals.
        try {
            jdbc.execute("ALTER TABLE workshop_item_state ADD COLUMN target_level INTEGER");
        } catch (Exception ignored) {
            // Column already exists — safe to continue.
        }

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS workshop_preset_unlock (
                    is_plus     INTEGER NOT NULL CHECK (is_plus IN (0, 1)) PRIMARY KEY,
                    is_unlocked INTEGER NOT NULL DEFAULT 0 CHECK (is_unlocked IN (0, 1))
                )
                """);

        jdbc.execute("""
                INSERT OR IGNORE INTO workshop_preset_unlock (is_plus, is_unlocked) VALUES (0, 0), (1, 0)
                """);

        // Up to 5 named preset slots per type (Workshop / Workshop+).
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS workshop_preset (
                    id      INTEGER PRIMARY KEY AUTOINCREMENT,
                    is_plus INTEGER NOT NULL CHECK (is_plus IN (0, 1)),
                    slot    INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 5),
                    name    TEXT    NOT NULL DEFAULT '',
                    UNIQUE (is_plus, slot)
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS workshop_preset_item (
                    preset_id        INTEGER NOT NULL REFERENCES workshop_preset(id) ON DELETE CASCADE,
                    workshop_item_id INTEGER NOT NULL REFERENCES workshop_item(id),
                    target_level     INTEGER NOT NULL,
                    PRIMARY KEY (preset_id, workshop_item_id)
                )
                """);

        // ── Cards ─────────────────────────────────────────────────────────────

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS card_value_unit (
                    code TEXT PRIMARY KEY
                )
                """);

        jdbc.execute("""
                INSERT OR IGNORE INTO card_value_unit (code) VALUES
                    ('MULTIPLIER'),
                    ('PERCENT'),
                    ('ADDITIVE_PERCENT'),
                    ('SECONDS'),
                    ('MINUTES'),
                    ('COUNT')
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS card (
                    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
                    name                  TEXT    NOT NULL UNIQUE,
                    rarity                TEXT    NOT NULL CHECK (rarity IN ('COMMON', 'RARE', 'EPIC')),
                    description           TEXT    NOT NULL,
                    value_unit            TEXT    NOT NULL REFERENCES card_value_unit(code),
                    level_1               REAL    NOT NULL,
                    level_2               REAL    NOT NULL,
                    level_3               REAL    NOT NULL,
                    level_4               REAL    NOT NULL,
                    level_5               REAL    NOT NULL,
                    level_6               REAL    NOT NULL,
                    level_7               REAL    NOT NULL,
                    milestone_unlock_tier INTEGER,
                    milestone_unlock_wave INTEGER,
                    mastery_description   TEXT    NOT NULL,
                    mastery_stone_cost    INTEGER NOT NULL,
                    mastery_value_unit    TEXT    NOT NULL REFERENCES card_value_unit(code),
                    mastery_level_0       REAL    NOT NULL,
                    mastery_level_1       REAL    NOT NULL,
                    mastery_level_2       REAL    NOT NULL,
                    mastery_level_3       REAL    NOT NULL,
                    mastery_level_4       REAL    NOT NULL,
                    mastery_level_5       REAL    NOT NULL,
                    mastery_level_6       REAL    NOT NULL,
                    mastery_level_7       REAL    NOT NULL,
                    mastery_level_8       REAL    NOT NULL,
                    mastery_level_9       REAL    NOT NULL
                )
                """);

        // Slots 1-22 are unlocked with gems; slots 23-28 are unlocked with keys (vault).
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS card_slot (
                    slot_number     INTEGER PRIMARY KEY CHECK (slot_number BETWEEN 1 AND 28),
                    unlock_cost     INTEGER NOT NULL,
                    unlock_currency TEXT    NOT NULL CHECK (unlock_currency IN ('GEM', 'KEY')),
                    owned           INTEGER NOT NULL DEFAULT 0
                )
                """);

        // Migration: add owned column to existing installs that predate this schema change.
        try { jdbc.execute("ALTER TABLE card_slot ADD COLUMN owned INTEGER NOT NULL DEFAULT 0"); } catch (Exception ignored) {}

        jdbc.execute("""
                INSERT OR IGNORE INTO card_slot (slot_number, unlock_cost, unlock_currency) VALUES
                    (1,  0,     'GEM'),
                    (2,  50,    'GEM'),
                    (3,  100,   'GEM'),
                    (4,  200,   'GEM'),
                    (5,  300,   'GEM'),
                    (6,  400,   'GEM'),
                    (7,  500,   'GEM'),
                    (8,  600,   'GEM'),
                    (9,  750,   'GEM'),
                    (10, 1000,  'GEM'),
                    (11, 1200,  'GEM'),
                    (12, 1400,  'GEM'),
                    (13, 1600,  'GEM'),
                    (14, 1800,  'GEM'),
                    (15, 2500,  'GEM'),
                    (16, 3500,  'GEM'),
                    (17, 4500,  'GEM'),
                    (18, 5500,  'GEM'),
                    (19, 6500,  'GEM'),
                    (20, 7500,  'GEM'),
                    (21, 8500,  'GEM'),
                    (22, 10000, 'GEM'),
                    (23, 10,    'KEY'),
                    (24, 15,    'KEY'),
                    (25, 20,    'KEY'),
                    (26, 25,    'KEY'),
                    (27, 35,    'KEY'),
                    (28, 45,    'KEY')
                """);

        // Slot 1 is always owned (free, costs 0 gems).
        jdbc.execute("UPDATE card_slot SET owned = 1 WHERE slot_number = 1");

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS card_player_state (
                    card_id       INTEGER NOT NULL REFERENCES card(id) PRIMARY KEY,
                    star_level    INTEGER NOT NULL DEFAULT 1 CHECK (star_level BETWEEN 1 AND 7),
                    copies_owned  INTEGER NOT NULL DEFAULT 0,
                    mastery_level INTEGER NOT NULL DEFAULT 0 CHECK (mastery_level BETWEEN 0 AND 9)
                )
                """);

        // Up to 5 named presets; slot 1 is seeded as the default.
        // Additional presets are created when the Card Presets lab is researched.
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS card_preset (
                    id   INTEGER PRIMARY KEY AUTOINCREMENT,
                    slot INTEGER NOT NULL UNIQUE CHECK (slot BETWEEN 1 AND 5),
                    name TEXT    NOT NULL DEFAULT ''
                )
                """);

        jdbc.execute("""
                INSERT OR IGNORE INTO card_preset (slot, name) VALUES (1, 'Preset 1')
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS card_preset_assignment (
                    preset_id   INTEGER NOT NULL REFERENCES card_preset(id) ON DELETE CASCADE,
                    slot_number INTEGER NOT NULL REFERENCES card_slot(slot_number),
                    card_id     INTEGER NOT NULL REFERENCES card_player_state(card_id),
                    PRIMARY KEY (preset_id, slot_number),
                    UNIQUE (preset_id, card_id)
                )
                """);

        // ── Bots ──────────────────────────────────────────────────────────────

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS bot (
                    id                    INTEGER PRIMARY KEY,
                    code                  TEXT NOT NULL UNIQUE,
                    name                  TEXT NOT NULL,
                    bot_plus_ability_name TEXT NOT NULL
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS bot_stat (
                    id          INTEGER PRIMARY KEY,
                    bot_id      INTEGER NOT NULL REFERENCES bot(id),
                    stat_key    TEXT    NOT NULL,
                    label       TEXT    NOT NULL,
                    value_unit  TEXT    NOT NULL,
                    is_bot_plus INTEGER NOT NULL DEFAULT 0 CHECK (is_bot_plus IN (0, 1)),
                    max_level   INTEGER NOT NULL,
                    sort_order  INTEGER NOT NULL DEFAULT 0,
                    UNIQUE (bot_id, stat_key)
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS bot_stat_level_value (
                    bot_stat_id    INTEGER NOT NULL REFERENCES bot_stat(id),
                    level          INTEGER NOT NULL,
                    value          REAL    NOT NULL,
                    medals_to_next INTEGER,
                    PRIMARY KEY (bot_stat_id, level)
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS bot_player_state (
                    bot_id            INTEGER NOT NULL REFERENCES bot(id) PRIMARY KEY,
                    unlocked          INTEGER NOT NULL DEFAULT 0 CHECK (unlocked IN (0, 1)),
                    bot_plus_unlocked INTEGER NOT NULL DEFAULT 0 CHECK (bot_plus_unlocked IN (0, 1)),
                    unlock_order      INTEGER
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS bot_stat_player_level (
                    bot_stat_id   INTEGER NOT NULL REFERENCES bot_stat(id) PRIMARY KEY,
                    current_level INTEGER NOT NULL DEFAULT 0
                )
                """);

        // Migration: add target_level for per-stat upgrade goals on the tracker tab.
        try {
            jdbc.execute("ALTER TABLE bot_stat_player_level ADD COLUMN target_level INTEGER");
        } catch (Exception ignored) {
            // Column already exists — safe to continue.
        }

        // Up to 5 named preset slots; slot 1 seeded as default.
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS bot_preset (
                    id   INTEGER PRIMARY KEY AUTOINCREMENT,
                    slot INTEGER NOT NULL UNIQUE CHECK (slot BETWEEN 1 AND 5),
                    name TEXT    NOT NULL DEFAULT ''
                )
                """);

        jdbc.execute("""
                INSERT OR IGNORE INTO bot_preset (slot, name) VALUES (1, 'Preset 1')
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS bot_preset_unlock (
                    preset_id         INTEGER NOT NULL REFERENCES bot_preset(id) ON DELETE CASCADE,
                    bot_id            INTEGER NOT NULL REFERENCES bot(id),
                    unlocked          INTEGER NOT NULL DEFAULT 0 CHECK (unlocked IN (0, 1)),
                    bot_plus_unlocked INTEGER NOT NULL DEFAULT 0 CHECK (bot_plus_unlocked IN (0, 1)),
                    PRIMARY KEY (preset_id, bot_id)
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS bot_preset_stat_level (
                    preset_id    INTEGER NOT NULL REFERENCES bot_preset(id) ON DELETE CASCADE,
                    bot_stat_id  INTEGER NOT NULL REFERENCES bot_stat(id),
                    target_level INTEGER NOT NULL,
                    PRIMARY KEY (preset_id, bot_stat_id)
                )
                """);

        // ── Guardian ──────────────────────────────────────────────────────────

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS guardian_chip (
                    id                   INTEGER PRIMARY KEY,
                    code                 TEXT    NOT NULL UNIQUE,
                    name                 TEXT    NOT NULL,
                    source               TEXT    NOT NULL CHECK (source IN ('BASE','GUILD_SHOP')),
                    unlock_season        INTEGER,
                    unlock_cost_tokens   INTEGER
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS guardian_chip_stat (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    chip_id    INTEGER NOT NULL REFERENCES guardian_chip(id),
                    stat_key   TEXT    NOT NULL,
                    label      TEXT    NOT NULL,
                    value_unit TEXT    NOT NULL,
                    max_level  INTEGER NOT NULL,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    UNIQUE (chip_id, stat_key)
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS guardian_chip_stat_level_value (
                    chip_stat_id  INTEGER NOT NULL REFERENCES guardian_chip_stat(id),
                    level         INTEGER NOT NULL,
                    value         REAL    NOT NULL,
                    bits_to_next  INTEGER,
                    PRIMARY KEY (chip_stat_id, level)
                )
                """);

        // Singleton — guardian unlocked state.
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS guardian_player_state (
                    id       INTEGER PRIMARY KEY DEFAULT 1,
                    unlocked INTEGER NOT NULL DEFAULT 0 CHECK (unlocked IN (0, 1))
                )
                """);

        jdbc.execute("""
                INSERT OR IGNORE INTO guardian_player_state (id, unlocked) VALUES (1, 0)
                """);

        // One row per chip slot. unlock_cost_tokens NULL = cost not yet confirmed.
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS guardian_chip_slot (
                    slot_number        INTEGER PRIMARY KEY CHECK (slot_number BETWEEN 1 AND 10),
                    unlock_cost_tokens INTEGER
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS guardian_chip_slot_player_state (
                    slot_number INTEGER NOT NULL REFERENCES guardian_chip_slot(slot_number) PRIMARY KEY,
                    unlocked    INTEGER NOT NULL DEFAULT 0 CHECK (unlocked IN (0, 1))
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS guardian_chip_player_state (
                    chip_id  INTEGER NOT NULL REFERENCES guardian_chip(id) PRIMARY KEY,
                    acquired INTEGER NOT NULL DEFAULT 0 CHECK (acquired IN (0, 1))
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS guardian_chip_stat_player_level (
                    chip_stat_id  INTEGER NOT NULL REFERENCES guardian_chip_stat(id) PRIMARY KEY,
                    current_level INTEGER NOT NULL DEFAULT 0
                )
                """);

        // Migration: add target_level for per-stat upgrade goals on the tracker tab.
        try {
            jdbc.execute("ALTER TABLE guardian_chip_stat_player_level ADD COLUMN target_level INTEGER");
        } catch (Exception ignored) {
            // Column already exists — safe to continue.
        }

        // Up to 5 named preset slots; slot 1 seeded as default.
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS guardian_preset (
                    id   INTEGER PRIMARY KEY AUTOINCREMENT,
                    slot INTEGER NOT NULL UNIQUE CHECK (slot BETWEEN 1 AND 5),
                    name TEXT    NOT NULL DEFAULT ''
                )
                """);

        jdbc.execute("""
                INSERT OR IGNORE INTO guardian_preset (slot, name) VALUES (1, 'Preset 1')
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS guardian_preset_chip (
                    preset_id INTEGER NOT NULL REFERENCES guardian_preset(id) ON DELETE CASCADE,
                    chip_id   INTEGER NOT NULL REFERENCES guardian_chip(id),
                    active    INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
                    PRIMARY KEY (preset_id, chip_id)
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS guardian_preset_stat_level (
                    preset_id    INTEGER NOT NULL REFERENCES guardian_preset(id) ON DELETE CASCADE,
                    chip_stat_id INTEGER NOT NULL REFERENCES guardian_chip_stat(id),
                    target_level INTEGER NOT NULL,
                    PRIMARY KEY (preset_id, chip_stat_id)
                )
                """);

        // ── Module Substat Catalog & Bans ─────────────────────────────────────

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS module_substat_def (
                    module_type TEXT NOT NULL,
                    key         TEXT NOT NULL,
                    label       TEXT NOT NULL,
                    PRIMARY KEY (module_type, key)
                )
                """);

        try {
            jdbc.execute("ALTER TABLE module_substat_def ADD COLUMN min_rarity TEXT NOT NULL DEFAULT 'Common'");
        } catch (Exception ignored) {}


        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS module_substat_ban (
                    module_type  TEXT NOT NULL,
                    substat_key  TEXT NOT NULL,
                    PRIMARY KEY (module_type, substat_key),
                    FOREIGN KEY (module_type, substat_key) REFERENCES module_substat_def(module_type, key)
                )
                """);

        // ── Workshop Item Values ──────────────────────────────────────────────

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS workshop_item_level_value (
                    workshop_item_id INTEGER NOT NULL REFERENCES workshop_item(id),
                    level            INTEGER NOT NULL CHECK (level >= 0),
                    value            REAL    NOT NULL,
                    PRIMARY KEY (workshop_item_id, level)
                )
                """);

        // ── Stat Key Mapping ─────────────────────────────────────────────────

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS workshop_item_stat_key (
                    workshop_item_id INTEGER NOT NULL REFERENCES workshop_item(id),
                    stat_key         TEXT    NOT NULL,
                    PRIMARY KEY (workshop_item_id, stat_key)
                )
                """);

        try {
            jdbc.execute("ALTER TABLE relic ADD COLUMN stat_key TEXT");
        } catch (Exception ignored) {}

        // ── Tournament Battle Conditions ──────────────────────────────────────

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS battle_condition (
                    id       INTEGER PRIMARY KEY AUTOINCREMENT,
                    name     TEXT    NOT NULL UNIQUE,
                    acronym  TEXT,
                    category TEXT    NOT NULL CHECK (category IN ('OVERHEAT', 'HEAT'))
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS tournament (
                    id     INTEGER PRIMARY KEY AUTOINCREMENT,
                    date   TEXT    NOT NULL,
                    league TEXT    NOT NULL CHECK (league IN ('SILVER', 'GOLD', 'PLATINUM', 'CHAMPION', 'LEGENDS')),
                    UNIQUE (date, league)
                )
                """);

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS tournament_condition (
                    tournament_id INTEGER NOT NULL REFERENCES tournament(id) ON DELETE CASCADE,
                    condition_id  INTEGER NOT NULL REFERENCES battle_condition(id),
                    PRIMARY KEY (tournament_id, condition_id)
                )
                """);

        jdbc.execute("""
                CREATE INDEX IF NOT EXISTS idx_tournament_date
                ON tournament (date)
                """);

        // Migration: add tournament_id FK to link a run to its tournament.
        try {
            jdbc.execute("ALTER TABLE runs ADD COLUMN tournament_id INTEGER REFERENCES tournament(id)");
        } catch (Exception ignored) {
            // Column already exists — safe to continue.
        }

        // ── Content Patches ──────────────────────────────────────────────────
        // Tracks the last remotely-published lab/workshop content version applied by
        // ContentPatchService, so a re-published patch at the same version is a no-op.

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS content_patch_state (
                    id              INTEGER PRIMARY KEY CHECK (id = 1),
                    applied_version INTEGER NOT NULL DEFAULT 0,
                    applied_at      TEXT
                )
                """);

        jdbc.execute("""
                INSERT OR IGNORE INTO content_patch_state (id, applied_version) VALUES (1, 0)
                """);
    }

    private void backfillContentHashes() {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id, battle_epoch_seconds, real_time_seconds, game_time_seconds, tier, wave FROM runs WHERE content_hash IS NULL");
        for (Map<String, Object> row : rows) {
            String id       = (String) row.get("id");
            long epoch      = row.get("battle_epoch_seconds") != null ? ((Number) row.get("battle_epoch_seconds")).longValue() : 0L;
            long realTime   = row.get("real_time_seconds")   != null ? ((Number) row.get("real_time_seconds")).longValue()   : 0L;
            long gameTime   = row.get("game_time_seconds")   != null ? ((Number) row.get("game_time_seconds")).longValue()   : 0L;
            int  tier       = ((Number) row.get("tier")).intValue();
            int  wave       = ((Number) row.get("wave")).intValue();
            String hash = RunRepository.computeContentHash(epoch, realTime, gameTime, tier, wave);
            try {
                jdbc.update("UPDATE runs SET content_hash = ? WHERE id = ?", hash, id);
            } catch (Exception e) {
                log.warn("Skipping content_hash backfill for run id={} (likely duplicate): {}", id, e.getMessage());
            }
        }
    }
}
