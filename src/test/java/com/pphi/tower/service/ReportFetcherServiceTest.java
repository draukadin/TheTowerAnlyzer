package com.pphi.tower.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.module.SimpleModule;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.google.api.services.drive.model.File;
import com.pphi.tower.config.DriveProperties;
import com.pphi.tower.fixtures.BattleHistoryFixtures;
import com.pphi.tower.jackson.BattleHistoryDeserializer;
import com.pphi.tower.model.battlehistory.BattleHistory;
import com.pphi.tower.parser.BattleHistoryParser;
import com.pphi.tower.repository.GoogleDriveRepository;
import com.pphi.tower.repository.RunRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ReportFetcherServiceTest {

    @Mock private DriveProperties config;
    @Mock private BattleHistoryParser parser;
    @Mock private RunRepository runRepository;
    @Mock private GoogleDriveRepository googleDriveRepository;
    @Mock private TierPersonalBestService tierPersonalBestService;

    private ReportFetcherService service;
    private ObjectMapper mapper;

    @BeforeEach
    void setUp() {
        mapper = new ObjectMapper().registerModule(new JavaTimeModule());
        SimpleModule m = new SimpleModule();
        m.addDeserializer(BattleHistory.class, new BattleHistoryDeserializer());
        mapper.registerModule(m);
        service = new ReportFetcherService(config, parser, runRepository, googleDriveRepository, mapper, tierPersonalBestService);
    }

    // ── blank folderId guard ─────────────────────────────────────────────────

    @Test
    void processReports_nullFolderId_throwsIllegalState() {
        when(config.getBattleReportsFolderId()).thenReturn(null);
        assertThatThrownBy(() -> service.processReports())
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void processReports_blankFolderId_throwsIllegalState() {
        when(config.getBattleReportsFolderId()).thenReturn("   ");
        assertThatThrownBy(() -> service.processReports())
                .isInstanceOf(IllegalStateException.class);
    }

    // ── happy path ───────────────────────────────────────────────────────────

    @Test
    void processReports_noFilesInFolder_returnsZero() throws IOException {
        when(config.getBattleReportsFolderId()).thenReturn("folder-id");
        when(googleDriveRepository.listFilesInFolder("folder-id")).thenReturn(List.of());
        assertThat(service.processReports()).isZero();
    }

    @Test
    void processReports_oneNewFile_returnsOne() throws IOException {
        when(config.getBattleReportsFolderId()).thenReturn("folder-id");
        when(googleDriveRepository.listFilesInFolder("folder-id"))
                .thenReturn(List.of(driveFile("id1", "v1.0.0_farming_Battle_Report_2026-01-01_10-00-00.txt")));
        when(runRepository.existsById("id1")).thenReturn(false);
        when(runRepository.existsByContentHash(anyString())).thenReturn(false);

        BattleHistory history = BattleHistoryFixtures.unknownVariance();
        when(parser.parse(any(com.pphi.tower.model.googledrive.BattleReportDriveFile.class))).thenReturn(history);
        when(googleDriveRepository.downloadFile("id1"))
                .thenReturn(new ByteArrayInputStream("content".getBytes()));

        int result = service.processReports();
        assertThat(result).isEqualTo(1);
        verify(tierPersonalBestService).recordResult(8, "farming", null, 3000);
    }

    @Test
    void processReports_alreadyExistingFile_isSkipped() throws IOException {
        when(config.getBattleReportsFolderId()).thenReturn("folder-id");
        when(googleDriveRepository.listFilesInFolder("folder-id"))
                .thenReturn(List.of(driveFile("id1", "v1.0.0_farming_2026.txt")));
        when(runRepository.existsById("id1")).thenReturn(true);

        int result = service.processReports();
        assertThat(result).isZero();
        verify(googleDriveRepository, never()).downloadFile(anyString());
    }

    @Test
    void processReports_twoFiles_oneDuplicate_insertsOne() throws IOException {
        when(config.getBattleReportsFolderId()).thenReturn("folder-id");
        when(googleDriveRepository.listFilesInFolder("folder-id")).thenReturn(List.of(
                driveFile("id1", "v1.0.0_farming_Battle_Report_2026-01-01_10-00-00.txt"),
                driveFile("id2", "v1.0.0_farming_Battle_Report_2026-01-02_10-00-00.txt")));
        when(runRepository.existsById("id1")).thenReturn(false);
        when(runRepository.existsById("id2")).thenReturn(true);
        when(runRepository.existsByContentHash(anyString())).thenReturn(false);

        BattleHistory history = BattleHistoryFixtures.unknownVariance();
        when(parser.parse(any(com.pphi.tower.model.googledrive.BattleReportDriveFile.class))).thenReturn(history);
        when(googleDriveRepository.downloadFile("id1"))
                .thenReturn(new ByteArrayInputStream("content".getBytes()));

        int result = service.processReports();
        assertThat(result).isEqualTo(1);
        verify(runRepository, times(1)).insert(any(), any(), any(), any(), any(),
                anyInt(), anyInt(), anyDouble(), anyLong(), anyLong(),
                anyDouble(), anyDouble(), any(), any(), any(), anyLong());
    }

    // ── null BATTLE_REPORT section ───────────────────────────────────────────

    @Test
    void processReports_nullBattleReportSection_fileSkipped() throws IOException {
        when(config.getBattleReportsFolderId()).thenReturn("folder-id");
        when(googleDriveRepository.listFilesInFolder("folder-id"))
                .thenReturn(List.of(driveFile("id1", "v1.0.0_farming_Battle_Report_2026-01-01_10-00-00.txt")));
        when(runRepository.existsById("id1")).thenReturn(false);
        when(googleDriveRepository.downloadFile("id1"))
                .thenReturn(new ByteArrayInputStream("content".getBytes()));

        // History with no sections → BATTLE_REPORT is null
        when(parser.parse(any(com.pphi.tower.model.googledrive.BattleReportDriveFile.class)))
                .thenReturn(new BattleHistory(new java.util.HashMap<>()));

        int result = service.processReports();
        assertThat(result).isEqualTo(1);
        verify(runRepository, never()).insert(any(), any(), any(), any(), any(),
                anyInt(), anyInt(), anyDouble(), anyLong(), anyLong(),
                anyDouble(), anyDouble(), any(), any(), any(), anyLong());
        verifyNoInteractions(tierPersonalBestService);
    }

    // ── IOException from stream — logged and file skipped ───────────────────

    @Test
    void processReports_downloadIOException_fileSkippedAndCountStillReturned() throws IOException {
        when(config.getBattleReportsFolderId()).thenReturn("folder-id");
        when(googleDriveRepository.listFilesInFolder("folder-id"))
                .thenReturn(List.of(driveFile("id1", "v1.0.0_farming_Battle_Report_2026-01-01_10-00-00.txt")));
        when(runRepository.existsById("id1")).thenReturn(false);
        // InputStream that throws on readAllBytes → caught by the IOException handler
        when(googleDriveRepository.downloadFile("id1")).thenReturn(new java.io.InputStream() {
            @Override public int read() throws IOException { throw new IOException("network error"); }
        });

        int result = service.processReports();
        assertThat(result).isEqualTo(1);
        verify(runRepository, never()).insert(any(), any(), any(), any(), any(),
                anyInt(), anyInt(), anyDouble(), anyLong(), anyLong(),
                anyDouble(), anyDouble(), any(), any(), any(), anyLong());
        verifyNoInteractions(tierPersonalBestService);
    }

    // ── content-hash duplicate guard ─────────────────────────────────────────

    @Test
    void processReports_contentHashDuplicate_fileSkipped() throws IOException {
        when(config.getBattleReportsFolderId()).thenReturn("folder-id");
        when(googleDriveRepository.listFilesInFolder("folder-id"))
                .thenReturn(List.of(driveFile("id1", "v1.0.0_farming_Battle_Report_2026-01-01_10-00-00.txt")));
        when(runRepository.existsById("id1")).thenReturn(false);
        when(runRepository.existsByContentHash(anyString())).thenReturn(true);
        when(googleDriveRepository.downloadFile("id1"))
                .thenReturn(new ByteArrayInputStream("content".getBytes()));

        BattleHistory history = BattleHistoryFixtures.unknownVariance();
        when(parser.parse(any(com.pphi.tower.model.googledrive.BattleReportDriveFile.class))).thenReturn(history);

        service.processReports();
        verify(runRepository, never()).insert(any(), any(), any(), any(), any(),
                anyInt(), anyInt(), anyDouble(), anyLong(), anyLong(),
                anyDouble(), anyDouble(), any(), any(), any(), anyLong());
        verifyNoInteractions(tierPersonalBestService);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private File driveFile(String id, String name) {
        return new File().setId(id).setName(name);
    }
}