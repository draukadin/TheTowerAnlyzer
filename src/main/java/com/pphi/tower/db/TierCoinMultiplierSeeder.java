package com.pphi.tower.db;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * Seeds {@code tier_coin_multiplier} from the bundled {@code tier_coin_multiplier.json} on first
 * boot. Remote content patches (see {@link com.pphi.tower.service.ContentPatchService}) can add or
 * update tiers later without an app release.
 */
@Component
public class TierCoinMultiplierSeeder {

    private static final Logger log = LoggerFactory.getLogger(TierCoinMultiplierSeeder.class);

    private final JdbcTemplate jdbc;

    public TierCoinMultiplierSeeder(JdbcTemplate jdbc, DatabaseInitializer init) {
        this.jdbc = jdbc;
        seed();
    }

    private void seed() {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM tier_coin_multiplier", Integer.class);
        if (count != null && count > 0) return;

        log.info("Seeding TierCoinMultiplier...");
        Map<String, Double> values = ContentDefinitions.readFlatNumericMap(new ClassPathResource("tier_coin_multiplier.json"));
        for (Map.Entry<String, Double> entry : values.entrySet()) {
            jdbc.update(
                    "INSERT OR IGNORE INTO tier_coin_multiplier (tier, multiplier) VALUES (?, ?)",
                    Integer.parseInt(entry.getKey()), entry.getValue());
        }
        log.info("Finished seeding TierCoinMultiplier");
    }
}
