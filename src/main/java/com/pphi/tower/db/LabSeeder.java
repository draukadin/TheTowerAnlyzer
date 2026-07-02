package com.pphi.tower.db;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class LabSeeder {

    private static final Logger log = LoggerFactory.getLogger(LabSeeder.class);

    private final JdbcTemplate jdbc;

    public LabSeeder(JdbcTemplate jdbc, DatabaseInitializer init) {
        this.jdbc = jdbc;
        seed();
    }

    private void seed() {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM lab", Integer.class);
        if (count != null && count > 0) return;
        log.info("Seeding {}...", this.getClass().getSimpleName().replace("Seeder", ""));
        for (ContentDefinitions.LabDefinition def : ContentDefinitions.readLabDefinitions()) {
            lab(def.name(), def.category(), 0, null, def.maxLevel());
        }
        log.info("Finished seeding {}", this.getClass().getSimpleName().replace("Seeder", ""));
    }

    private void lab(String name, String category, int currentLevel, Integer targetLevel, int maxLevel) {
        Long id = jdbc.queryForObject(
                "INSERT INTO lab (name, category, max_level) VALUES (?,?,?) RETURNING id",
                Long.class, name, category, maxLevel);
        if (id == null) return;
        jdbc.update(
                "INSERT INTO lab_player_state (lab_id, current_level, target_level) VALUES (?,?,?)",
                id, currentLevel, targetLevel);
    }
}
