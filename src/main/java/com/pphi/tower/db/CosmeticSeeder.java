package com.pphi.tower.db;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class CosmeticSeeder {

    private static final Logger log = LoggerFactory.getLogger(CosmeticSeeder.class);

    private final JdbcTemplate jdbc;

    public CosmeticSeeder(JdbcTemplate jdbc, DatabaseInitializer init) {
        this.jdbc = jdbc;
        seed();
    }

    private void seed() {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM cosmetic_category", Integer.class);
        if (count != null && count > 0) {
            migrateCoinBonusPerItem();
            return;
        }
        log.info("Seeding {}...", this.getClass().getSimpleName().replace("Seeder", ""));
        seedCategories();
        seedEvents();
        seedMilestoneSkins();
        seedSongs();
        seedGuardians();
        seedMenus();
        seedProfileBanners();
        migrateCoinBonusPerItem();
        log.info("Finished seeding {}", this.getClass().getSimpleName().replace("Seeder", ""));
    }

    private void seedCategories() {
        category("tower_skin",      "Event Tower",       0.004);
        category("background_skin", "Event Background",  0.008);
        category("milestone_skin",  "Tier Skins",        0.004);
        category("song",            "Songs",             0.006);
        category("guardian",        "Guardians",         0.006);
        category("menu",            "Menu",              0.006);
        category("profile_banner",  "Profile Banners",   0.006);
    }

    /**
     * Idempotent per-category Coin Bonus values (distinct from the generic {@code bonus_per_item}
     * above) — also reaches already-seeded databases.
     */
    private void migrateCoinBonusPerItem() {
        coinBonusPerItem("song",            0.006);
        coinBonusPerItem("profile_banner",  0.006);
        coinBonusPerItem("tower_skin",      0.004);
        coinBonusPerItem("milestone_skin",  0.004);
        coinBonusPerItem("menu",            0.006);
        coinBonusPerItem("background_skin", 0.008);
        coinBonusPerItem("guardian",        0.006);
    }

    private void coinBonusPerItem(String categoryId, double coinBonusPerItem) {
        jdbc.update("UPDATE cosmetic_category SET coin_bonus_per_item = ? WHERE id = ?",
                coinBonusPerItem, categoryId);
    }

    // Each row in the spreadsheet represents one event with a paired tower skin and background skin.
    private void seedEvents() {
        event("Interstellar",     2, "Star", "Interstellar");
        event("Volcano",          2, "Eye of the Lord", "Volcano");
        event("Plasma Returns",   2, "Plasma Ball", "Plasma Field");
        event("Honey",            2, "Bee", "Honeycomb");
        event("Aurora",           2, "North Spirit", "Aurora");
        event("Aliens",           2, "Alien", "Alien Ship");
        event("Ocean Night",      2, "Water Droplet", "Ocean Night");
        event("Cherry Blossom",   3, "Cherry Blossom", "Sakura");
        event("Easter",           1, "Bunny", "Easter");
        event("Retrowave",        2, "Neo Turbo", "Retrowave");
        event("Prismatic Lines",  1, "Prisma", "Prismatic Lines");
        event("Cobweb",           2, "Spider", "Cobweb");
        event("Into the Matrix",  2, "Sentinel", "Matrix");
        event("Viral Outbreak",   1, "Virus", "Virus Field");
        event("Full Moon",        1, "Howling Wolf", "Mountain Night");
        event("Sands of Time",    1, "Hourglass", "Sandstorm");
        event("Autumn",           2, "Autumn Leaf", "Autumn Forest");
        event("Halloween",        1, "Pumpkin", "Haunted House");
        event("Retro Arcade",     2, "Invader", "Arcade");
        event("New Year",         2, "Toast Glass", "New Year");
        event("Dark Strands",     1, "Dark Tower", "Dark Strands");
        event("Deep Blue Sea",    1, "Dive Helmet", "Deep Sea");
        event("Faster Than Light",1, "Starship", "Hyper Space");
        event("Invaders",         1, "Elite Tower", "Invasion");
        event("Sunset Fishing",   1, "Fisherman", "Sunset River");
        event("Into The Storm",   1, "Storm Eye", "Hurricane");
        event("Rainfall",         1, "Umbrella", "Rainfall");
        event("Tower's Channel",  1, "Noise Tower", "TV Wall");
        event("Abduction",        1, "Unlucky Cow", "Abduction");
        event("Snowstorm",        1, "Snowman", "Snowstorm");
        event("Meowy Night",      1, "Black Cat", "Forest of Cats");
        event("Gravity",          1, "Black Hole", "Event Horizon");
        event("What Time Is It?", 1, "Pocket Watch", "Clock Tower");
        event("Pi",               1, "Neon Pi", "Pi Disk");
        event("Koi Pond",         1, "Frog", "Koi Pond");
        event("Camping",          1, "Marshmallow", "Camping");
        event("Cthulhu",          1, "Cthulhu", "Cthulhu");
        event("Cyberpunk",        1, "Flying Car", "Cyberpunk");
        event("Crystal Cave",     1, "Crystal", "Crystal Cave");
        event("Amusement Park",   1, "Balloon", "Amusement Park");
        event("Valentine",        1, "Heart", "Valentine");
        event("Glitch",           1, "Glitch", "Glitch");
        event("Neuron",           1, "Brain", "Neuron");
        event("Guild Season 1",   1, "Crown", "Throne Room");
        event("Guild Season 2",   1, "Mech Warrior", "Mech World");
        event("Guild Season 3",   1, "Dj", "Party");
        event("Guild Season 4",   1, "Pixel Soldier", "Pixel Alien War");
        event("Guild Season 5",   1, "Restless Eye", "Crimson Horror");
        event("Guild Season 6",   1, "Shining Star", "Cozy Cosmos");
        event("Guild Season 7",   1, "Space Telescope", "Supernova");
        event("Guild Season 8",   1, "Bear", "Claw Machine");
        event("Guild Season 9",   1, "Rabbit In Hat", "Magician");
    }

    private void seedMilestoneSkins() {
        milestoneSkin(1,  "Shuriken", "Tier 1",  "Free");
        milestoneSkin(2,  "Donut", "Tier 2",  "Pass 1");
        milestoneSkin(3,  "Yin-Yang", "Tier 3",  "Free");
        milestoneSkin(4,  "Smile", "Tier 4",  "Free");
        milestoneSkin(5,  "Butterfly", "Tier 5",  "Pass 2");
        milestoneSkin(6,  "Sheep", "Tier 6",  "Free");
        milestoneSkin(7,  "Fried Egg", "Tier 7",  "Free");
        milestoneSkin(8,  "Mush-mush", "Tier 8",  "Pass 3");
        milestoneSkin(9,  "Turtle", "Tier 9",  "Free");
        milestoneSkin(10, "Cheese", "Tier 10", "Free");
        milestoneSkin(11, "Cat", "Tier 11", "Pass 4");
        milestoneSkin(12, "Skull", "Tier 12", "Free");
        milestoneSkin(13, "Creepy Clown", "Tier 13", "Free");
        milestoneSkin(14, "Panda", "Tier 14", "Pass 5");
        milestoneSkin(15, "Tech Tree", "Tier 15", "Free");
        milestoneSkin(16, "Cactus", "Tier 16", "Free");
        milestoneSkin(17, "Dragon", "Tier 17", "Pass 6");
        milestoneSkin(18, "Rhino", "Tier 18", "Free");
        milestoneSkin(19, "Atomic", "Tier 19", "Free");
        milestoneSkin(20, "Cyber", "Tier 20", "Pass 7");
        milestoneSkin(21, "Eclipse", "Tier 21", "Free");
    }

    private void seedSongs() {
        song("Krisu - Oceans Sings");
        song("Krisu - Hiding in Himalaya");
        song("Krisu - Forest Bathing");
    }

    private void seedGuardians() {
        guardian("Butter");
        guardian("Muse");
        guardian("Finn");
        guardian("Nyra");
        guardian("Rolo");
        guardian("Glenn");
        guardian("Zepe");
        guardian("Iris");
        guardian("Silk");
        guardian("Mickey");
        guardian("Gaia");
        guardian("Arwing");
        guardian("Frank");
        guardian("Earl");
        guardian("Mei");
        guardian("Shelly");
        guardian("Disco");
    }

    private void seedMenus() {
        menu("Dark Being");
        menu("Mech World");
        menu("Party");
        menu("Pixel Alien War");
        menu("Crimson Horror");
        menu("Cosy Cosmos");
        menu("Supernova");
        menu("Claw Machine");
        menu("Magician");
    }

    private void seedProfileBanners() {
        profileBanner("Mech World");
        profileBanner("Party");
        profileBanner("Pixel Alien War");
        profileBanner("Crimson Horror");
        profileBanner("Cosy Cosmos");
        profileBanner("Supernova");
        profileBanner("Claw Machine");
        profileBanner("Magician");
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private void category(String id, String displayName, double bonusPerItem) {
        jdbc.update("INSERT OR IGNORE INTO cosmetic_category (id, display_name, bonus_per_item) VALUES (?,?,?)",
                id, displayName, bonusPerItem);
    }

    private void event(String eventName, int reroll,
                       String towerSkin,
                       String bgSkin) {
        jdbc.update("INSERT OR IGNORE INTO cosmetic_event (name, reroll_multiplier) VALUES (?,?)",
                eventName, reroll);
        Long eventId = jdbc.queryForObject("SELECT id FROM cosmetic_event WHERE name = ?", Long.class, eventName);
        item("tower_skin",      towerSkin, eventId, null, null, null);
        item("background_skin", bgSkin, eventId, null, null, null);
    }

    private void milestoneSkin(int number, String name, String tier, String unlock) {
        item("milestone_skin", name, null, number, tier, unlock);
    }

    private void song(String name)          { item("song",           name, null, null, null, null); }
    private void guardian(String name)      { item("guardian",       name, null, null, null, null); }
    private void menu(String name)          { item("menu",           name, null, null, null, null); }
    private void profileBanner(String name) { item("profile_banner", name, null, null, null, null); }

    private void item(String categoryId, String name,
                      Long eventId, Integer milestoneNumber, String milestoneTier, String milestoneUnlock) {
        jdbc.update("""
                INSERT OR IGNORE INTO cosmetic_item
                    (category_id, name, owned, event_id, milestone_number, milestone_tier, milestone_unlock)
                VALUES (?,?,?,?,?,?,?)
                """,
                categoryId, name, 0,
                eventId, milestoneNumber, milestoneTier, milestoneUnlock);
    }
}
