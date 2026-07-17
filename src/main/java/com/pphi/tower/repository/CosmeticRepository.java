package com.pphi.tower.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public class CosmeticRepository {

    private final JdbcTemplate jdbc;

    public CosmeticRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record CosmeticItem(
            long id,
            String categoryId,
            String categoryName,
            double bonusPerItem,
            double coinBonusPerItem,
            String name,
            boolean owned,
            Long eventId,
            String eventName,
            Integer rerollMultiplier,
            Integer milestoneNumber,
            String milestoneTier,
            String milestoneUnlock
    ) {}

    public List<CosmeticItem> getAll() {
        return jdbc.query("""
                SELECT i.id, i.category_id, c.display_name, c.bonus_per_item, c.coin_bonus_per_item,
                       i.name, i.owned,
                       i.event_id, e.name AS event_name, e.reroll_multiplier,
                       i.milestone_number, i.milestone_tier, i.milestone_unlock
                FROM cosmetic_item i
                JOIN cosmetic_category c ON c.id = i.category_id
                LEFT JOIN cosmetic_event e ON e.id = i.event_id
                ORDER BY c.id, e.name NULLS LAST, i.milestone_number NULLS LAST, i.name
                """,
                (rs, i) -> new CosmeticItem(
                        rs.getLong("id"),
                        rs.getString("category_id"),
                        rs.getString("display_name"),
                        rs.getDouble("bonus_per_item"),
                        rs.getDouble("coin_bonus_per_item"),
                        rs.getString("name"),
                        rs.getInt("owned") == 1,
                        rs.getObject("event_id")        != null ? rs.getLong("event_id")             : null,
                        rs.getString("event_name"),
                        rs.getObject("reroll_multiplier") != null ? rs.getInt("reroll_multiplier")   : null,
                        rs.getObject("milestone_number")  != null ? rs.getInt("milestone_number")    : null,
                        rs.getString("milestone_tier"),
                        rs.getString("milestone_unlock")
                ));
    }

    public void setOwned(long id, boolean owned) {
        jdbc.update("UPDATE cosmetic_item SET owned = ? WHERE id = ?", owned ? 1 : 0, id);
    }

    /** Creates a cosmetic_event and both its paired skins. */
    public void addEvent(String eventName, int reroll, String towerSkinName, String bgSkinName) {
        Long eventId = jdbc.queryForObject(
                "INSERT INTO cosmetic_event (name, reroll_multiplier) VALUES (?,?) RETURNING id",
                Long.class, eventName, reroll);
        if (eventId == null) throw new RuntimeException("Failed to insert event");
        jdbc.update("""
                INSERT INTO cosmetic_item (category_id, name, owned, event_id) VALUES (?,?,0,?)
                """, "tower_skin", towerSkinName, eventId);
        jdbc.update("""
                INSERT INTO cosmetic_item (category_id, name, owned, event_id) VALUES (?,?,0,?)
                """, "background_skin", bgSkinName, eventId);
    }

    /** Creates a single non-event cosmetic item (song, guardian, menu, profile_banner, milestone_skin). */
    public long addItem(String categoryId, String name,
                        Integer milestoneNumber, String milestoneTier, String milestoneUnlock) {
        Long id = jdbc.queryForObject("""
                INSERT INTO cosmetic_item
                    (category_id, name, owned, milestone_number, milestone_tier, milestone_unlock)
                VALUES (?,?,0,?,?,?) RETURNING id
                """, Long.class, categoryId, name, milestoneNumber, milestoneTier, milestoneUnlock);
        if (id == null) throw new RuntimeException("Failed to insert cosmetic item");
        return id;
    }
}
