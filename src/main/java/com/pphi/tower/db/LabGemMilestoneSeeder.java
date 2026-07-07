package com.pphi.tower.db;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class LabGemMilestoneSeeder {

    private static final Logger log = LoggerFactory.getLogger(LabGemMilestoneSeeder.class);

    // Official baseline gem milestone curve: (days remaining, base gem cost).
    private static final List<Object[]> MILESTONES = List.of(
            new Object[]{0.0, 0},
            new Object[]{0.04167, 8},
            new Object[]{1.0, 163},
            new Object[]{7.0, 1000},
            new Object[]{30.0, 3550},
            new Object[]{90.0, 8000},
            new Object[]{360.0, 25000}
    );

    public LabGemMilestoneSeeder(JdbcTemplate jdbc, DatabaseInitializer dbInit) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM lab_gem_milestone", Integer.class);
        if (count != null && count == MILESTONES.size()) return;

        log.info("Seeding LabGemMilestone...");
        jdbc.execute("DELETE FROM lab_gem_milestone");
        jdbc.batchUpdate("INSERT INTO lab_gem_milestone (milestone_days, base_gems) VALUES (?, ?)", MILESTONES);
    }
}
