package com.pphi.tower.repository;

import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public class IapPurchaseRepository {

    private final JdbcTemplate jdbc;

    public IapPurchaseRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record IapPurchaseData(String key, String displayName, double multiplier, boolean owned) {}

    @Cacheable("iap-purchases")
    public List<IapPurchaseData> getAll() {
        return jdbc.query("""
                SELECT key, display_name, multiplier, owned
                FROM iap_purchase
                ORDER BY key
                """,
                (rs, i) -> new IapPurchaseData(
                        rs.getString("key"),
                        rs.getString("display_name"),
                        rs.getDouble("multiplier"),
                        rs.getInt("owned") != 0
                ));
    }

    @CacheEvict(value = "iap-purchases", allEntries = true)
    public void setOwned(String key, boolean owned) {
        jdbc.update("UPDATE iap_purchase SET owned = ? WHERE key = ?", owned ? 1 : 0, key);
    }
}
