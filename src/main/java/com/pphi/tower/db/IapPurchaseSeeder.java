package com.pphi.tower.db;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Seeds the one-time IAP unlocks that contribute a fixed coin multiplier. */
@Component
public class IapPurchaseSeeder {

    private static final Logger log = LoggerFactory.getLogger(IapPurchaseSeeder.class);

    private final JdbcTemplate jdbc;

    public IapPurchaseSeeder(JdbcTemplate jdbc, DatabaseInitializer init) {
        this.jdbc = jdbc;
        seed();
    }

    private void seed() {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM iap_purchase", Integer.class);
        if (count != null && count > 0) return;

        log.info("Seeding IapPurchase...");
        purchase("disable_ads", "Disable Ads", 1.50);
        purchase("starter_pack", "Starter Pack", 2.00);
        purchase("epic_pack", "Epic Pack", 3.00);
        log.info("Finished seeding IapPurchase");
    }

    private void purchase(String key, String displayName, double multiplier) {
        jdbc.update(
                "INSERT OR IGNORE INTO iap_purchase (key, display_name, multiplier, owned) VALUES (?, ?, ?, 0)",
                key, displayName, multiplier);
    }
}
