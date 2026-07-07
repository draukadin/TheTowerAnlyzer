package com.pphi.tower.service;

import com.pphi.tower.model.sheets.Currencies;
import com.pphi.tower.parser.PlayerInfoReader;
import com.pphi.tower.repository.CurrencySnapshotRepository;
import com.pphi.tower.repository.LabRepository;
import com.pphi.tower.repository.LabRepository.LabData;
import com.pphi.tower.repository.WorkshopRepository;
import com.pphi.tower.repository.WorkshopRepository.WorkshopItem;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * Imports a playerInfo.dat save file (parsed by {@link PlayerInfoReader}) into the
 * analyzer's database: a currency snapshot, and lab/workshop current levels.
 *
 * <p>playerInfo.dat stores lab and workshop levels as fixed-size, unlabeled per-category
 * arrays (20 slots each for Attack/Defense/Utility) with no id or name attached — array
 * index N corresponds to the Nth lab/item seeded for that category, in {@code id} order
 * (see {@code LabSeeder}/{@code WorkshopSeeder}). This was confirmed by cross-referencing
 * decoded values against seeded {@code max_level}s: many array entries land exactly on a
 * maxed-out item's max level.
 */
@Service
public class PlayerInfoImportService {

    private final PlayerInfoReader reader;
    private final CurrencySnapshotRepository currencyRepo;
    private final LabRepository labRepo;
    private final WorkshopRepository workshopRepo;

    public PlayerInfoImportService(PlayerInfoReader reader,
                                    CurrencySnapshotRepository currencyRepo,
                                    LabRepository labRepo,
                                    WorkshopRepository workshopRepo) {
        this.reader = reader;
        this.currencyRepo = currencyRepo;
        this.labRepo = labRepo;
        this.workshopRepo = workshopRepo;
    }

    public record ImportSummary(boolean currenciesSaved, int labsUpdated, int workshopItemsUpdated) {}

    public ImportSummary importPlayerInfo(byte[] fileBytes) throws IOException {
        Map<String, Object> data = reader.read(fileBytes);

        boolean currenciesSaved = importCurrencies(data);
        int labsUpdated = importLabCategory(data, "enhancementLevel", "Attack")
                + importLabCategory(data, "enhancementDefenseLevel", "Defense")
                + importLabCategory(data, "enhancementUtilityLevel", "Utility");
        int workshopUpdated = importWorkshopCategory(data, "upgradeWorkshopLevel", "ATTACK")
                + importWorkshopCategory(data, "upgradeWorkshopDefenseLevel", "DEFENSE")
                + importWorkshopCategory(data, "upgradeWorkshopUtilityLevel", "UTILITY");

        return new ImportSummary(currenciesSaved, labsUpdated, workshopUpdated);
    }

    private boolean importCurrencies(Map<String, Object> data) {
        if (!data.containsKey("coins") && !data.containsKey("cells")) return false;

        Currencies currencies = new Currencies(
                CurrencySnapshotRepository.fromRaw(toDouble(data.get("coins"))),
                toInt(data.get("gems")),
                toInt(data.get("stones")),
                toInt(data.get("medals")),
                CurrencySnapshotRepository.fromRaw(toDouble(data.get("cells"))),
                toInt(data.get("keys")),
                toInt(data.get("tokens")),
                toInt(data.get("bits")),
                toInt(data.get("tickets")),
                toInt(data.get("moduleTickets")),
                toInt(data.get("moduleCannonShards")),
                toInt(data.get("moduleArmorShards")),
                toInt(data.get("moduleGeneratorShards")),
                toInt(data.get("moduleCoreShards")),
                toInt(data.get("moduleRerollCurrency"))
        );
        currencyRepo.saveCurrencySnapshot(LocalDateTime.now(), currencies);
        return true;
    }

    private int importLabCategory(Map<String, Object> data, String fieldName, String category) {
        int[] levels = toIntArray(data.get(fieldName));
        if (levels == null) return 0;

        List<LabData> labs = labRepo.getByCategory(category);
        int updated = 0;
        for (int i = 0; i < labs.size() && i < levels.length; i++) {
            LabData lab = labs.get(i);
            if (levels[i] != lab.currentLevel()) {
                labRepo.updateState(lab.id(), levels[i], lab.targetLevel());
                updated++;
            }
        }
        return updated;
    }

    private int importWorkshopCategory(Map<String, Object> data, String fieldName, String category) {
        int[] levels = toIntArray(data.get(fieldName));
        if (levels == null) return 0;

        List<WorkshopItem> items = workshopRepo.getAll().stream()
                .filter(item -> !item.isPlus() && item.category().equals(category))
                .sorted(Comparator.comparingLong(WorkshopItem::id))
                .toList();

        int updated = 0;
        for (int i = 0; i < items.size() && i < levels.length; i++) {
            WorkshopItem item = items.get(i);
            if (levels[i] != item.currentLevel()) {
                workshopRepo.updateLevel(item.id(), levels[i]);
                updated++;
            }
        }
        return updated;
    }

    private static int toInt(Object raw) {
        return raw instanceof Number n ? n.intValue() : 0;
    }

    private static double toDouble(Object raw) {
        return raw instanceof Number n ? n.doubleValue() : 0.0;
    }

    private static int[] toIntArray(Object raw) {
        return raw instanceof int[] arr ? arr : null;
    }
}
