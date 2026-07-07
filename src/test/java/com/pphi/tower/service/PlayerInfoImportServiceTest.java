package com.pphi.tower.service;

import com.pphi.tower.model.sheets.Currencies;
import com.pphi.tower.parser.PlayerInfoReader;
import com.pphi.tower.repository.CurrencySnapshotRepository;
import com.pphi.tower.repository.LabRepository;
import com.pphi.tower.repository.LabRepository.LabData;
import com.pphi.tower.repository.WorkshopRepository;
import com.pphi.tower.repository.WorkshopRepository.WorkshopItem;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PlayerInfoImportServiceTest {

    @Mock private PlayerInfoReader reader;
    @Mock private CurrencySnapshotRepository currencyRepo;
    @Mock private LabRepository labRepo;
    @Mock private WorkshopRepository workshopRepo;

    private PlayerInfoImportService service;

    @BeforeEach
    void setUp() {
        service = new PlayerInfoImportService(reader, currencyRepo, labRepo, workshopRepo);
    }

    // playerInfo.dat stores lab/workshop levels as fixed-size arrays with no id/name;
    // array index N is the Nth lab/item seeded for that category (ordered by id).
    @Test
    void importPlayerInfo_maps_labLevelArray_toLabsByIndex_withinCategory() throws Exception {
        Map<String, Object> data = new HashMap<>();
        data.put("enhancementLevel", new int[]{5, 0, 7, 0});

        when(reader.read(any(byte[].class))).thenReturn(data);
        when(labRepo.getByCategory("Attack")).thenReturn(List.of(
                new LabData(10, "Damage", "Attack", 100, 0, null, "", ""),
                new LabData(11, "Attack Speed", "Attack", 99, 0, null, "", ""),
                new LabData(12, "Critical Chance", "Attack", 79, 0, null, "", "")
        ));

        PlayerInfoImportService.ImportSummary summary = service.importPlayerInfo(new byte[0]);

        verify(labRepo).updateState(10, 5, null);
        verify(labRepo).updateState(12, 7, null);
        verify(labRepo, never()).updateState(eq(11L), anyInt(), any());
        assertThat(summary.labsUpdated()).isEqualTo(2);
    }

    @Test
    void importPlayerInfo_skips_labs_whoseDecodedLevel_matchesCurrent() throws Exception {
        Map<String, Object> data = new HashMap<>();
        data.put("enhancementLevel", new int[]{5});

        when(reader.read(any(byte[].class))).thenReturn(data);
        when(labRepo.getByCategory("Attack")).thenReturn(List.of(
                new LabData(10, "Damage", "Attack", 100, 5, null, "", "")
        ));

        PlayerInfoImportService.ImportSummary summary = service.importPlayerInfo(new byte[0]);

        verify(labRepo, never()).updateState(anyLong(), anyInt(), any());
        assertThat(summary.labsUpdated()).isEqualTo(0);
    }

    @Test
    void importPlayerInfo_maps_workshopLevelArray_toItemsByIndex_excludingPlus() throws Exception {
        Map<String, Object> data = new HashMap<>();
        data.put("upgradeWorkshopLevel", new int[]{99, 50});

        when(reader.read(any(byte[].class))).thenReturn(data);
        when(workshopRepo.getAll()).thenReturn(List.of(
                new WorkshopItem(1, "Damage", "Attack", false, 1, 6000, 99, null,
                        null, null, false, null, null),
                new WorkshopItem(2, "Damage +", "Attack", true, 1, 400, 0, null,
                        null, null, false, null, null),
                new WorkshopItem(3, "Attack Speed", "Attack", false, 2, 99, 0, null,
                        null, null, false, null, null)
        ));

        PlayerInfoImportService.ImportSummary summary = service.importPlayerInfo(new byte[0]);

        verify(workshopRepo).updateLevel(3, 50);
        verify(workshopRepo, never()).updateLevel(eq(1L), anyInt());
        verify(workshopRepo, never()).updateLevel(eq(2L), anyInt());
        assertThat(summary.workshopItemsUpdated()).isEqualTo(1);
    }

    @Test
    void importPlayerInfo_saves_currencySnapshot_fromDecodedFields() throws Exception {
        Map<String, Object> data = new HashMap<>();
        data.put("coins", 5.0e12);
        data.put("cells", 416673);
        data.put("gems", 5990);
        data.put("stones", 194);
        data.put("medals", 769);
        data.put("keys", 0);
        data.put("tokens", 35);
        data.put("bits", 80);

        when(reader.read(any(byte[].class))).thenReturn(data);

        PlayerInfoImportService.ImportSummary summary = service.importPlayerInfo(new byte[0]);

        ArgumentCaptor<Currencies> captor = ArgumentCaptor.forClass(Currencies.class);
        verify(currencyRepo).saveCurrencySnapshot(any(LocalDateTime.class), captor.capture());
        Currencies saved = captor.getValue();
        assertThat(saved.gems()).isEqualTo(5990);
        assertThat(saved.stones()).isEqualTo(194);
        assertThat(saved.medals()).isEqualTo(769);
        assertThat(saved.tokens()).isEqualTo(35);
        assertThat(saved.bits()).isEqualTo(80);
        assertThat(summary.currenciesSaved()).isTrue();
    }
}
