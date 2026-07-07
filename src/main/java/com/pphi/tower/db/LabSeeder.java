package com.pphi.tower.db;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

@Component
public class LabSeeder {

    private static final Logger log = LoggerFactory.getLogger(LabSeeder.class);

    private final JdbcTemplate jdbc;

    // UwSeeder param is unused beyond ordering: forces Spring to seed the `uw` table
    // before labs that reference `uw.id` via a code lookup are seeded.
    public LabSeeder(JdbcTemplate jdbc, DatabaseInitializer init, UwSeeder uwSeeder) {
        this.jdbc = jdbc;
        seed();
    }

    private void seed() {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM lab", Integer.class);
        if (count != null && count > 0) return;
        log.info("Seeding {}...", this.getClass().getSimpleName().replace("Seeder", ""));
        Map<String, Integer> uwIdByCode = new HashMap<>();
        jdbc.query("SELECT code, id FROM uw", rs -> {
            uwIdByCode.put(rs.getString("code"), rs.getInt("id"));
        });
        for (ContentDefinitions.LabDefinition def : ContentDefinitions.readLabDefinitions()) {
            Integer uwId = def.uw() != null ? uwIdByCode.get(def.uw()) : null;
            lab(def.name(), def.category(), 0, null, def.maxLevel(), def.unlock(), uwId);
        }
        log.info("Finished seeding {}", this.getClass().getSimpleName().replace("Seeder", ""));
    }

    private void lab(String name, String category, int currentLevel, Integer targetLevel, int maxLevel,
                      String unlock, Integer uwId) {
        Long id = jdbc.queryForObject(
                "INSERT INTO lab (name, category, max_level, unlock, uw_id) VALUES (?,?,?,?,?) RETURNING id",
                Long.class, name, category, maxLevel, unlock, uwId);
        if (id == null) return;
        jdbc.update(
                "INSERT INTO lab_player_state (lab_id, current_level, target_level) VALUES (?,?,?)",
                id, currentLevel, targetLevel);
    }
}
