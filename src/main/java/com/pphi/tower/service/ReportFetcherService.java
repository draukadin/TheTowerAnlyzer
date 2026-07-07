package com.pphi.tower.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.api.services.drive.model.File;
import com.pphi.tower.config.DriveProperties;
import com.pphi.tower.model.battlehistory.BattleHistory;
import com.pphi.tower.model.battlehistory.BattleReport;
import com.pphi.tower.model.battlehistory.Currencies;
import com.pphi.tower.model.battlehistory.SectionHeader;
import com.pphi.tower.model.googledrive.BattleReportDriveFile;
import com.pphi.tower.parser.BattleHistoryParser;
import com.pphi.tower.repository.GoogleDriveRepository;
import com.pphi.tower.repository.RunRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
public class ReportFetcherService {

    private static final Logger log = LoggerFactory.getLogger(ReportFetcherService.class);
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter
            .ofPattern("yyyy-MM-dd")
            .withZone(ZoneId.of("America/Los_Angeles"));

    private final DriveProperties config;
    private final BattleHistoryParser parser;
    private final RunRepository runRepository;
    private final GoogleDriveRepository googleDriveRepository;
    private final ObjectMapper objectMapper;
    private final TierPersonalBestService tierPersonalBestService;

    public ReportFetcherService(
            DriveProperties config,
            BattleHistoryParser parser,
            RunRepository runRepository,
            GoogleDriveRepository googleDriveRepository,
            ObjectMapper objectMapper,
            TierPersonalBestService tierPersonalBestService) {
        this.config = config;
        this.parser = parser;
        this.runRepository = runRepository;
        this.googleDriveRepository = googleDriveRepository;
        this.objectMapper = objectMapper;
        this.tierPersonalBestService = tierPersonalBestService;
    }

    public int processReports() {
        String folderId = config.getBattleReportsFolderId();
        if (folderId == null || folderId.isBlank()) {
            throw new IllegalStateException("Battle reports folder ID is not configured (drive.battle-reports-folder-id in user.properties)");
        }
        try {
            List<File> files = googleDriveRepository.listFilesInFolder(folderId);
            List<File> unprocessed = files.stream()
                    .filter(f -> !runRepository.existsById(f.getId()))
                    .toList();
            unprocessed.forEach(this::processFile);
            return unprocessed.size();
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    private void processFile(File file) {
        String filename = file.getName();
        try (InputStream inputStream = googleDriveRepository.downloadFile(file.getId())) {
            String contents = new String(inputStream.readAllBytes());
            BattleReportDriveFile battleReportDriveFile = new BattleReportDriveFile(file, contents);
            BattleHistory history = parser.parse(battleReportDriveFile);
            BattleReport report   = (BattleReport) history.sectionMap().get(SectionHeader.BATTLE_REPORT);
            Currencies currencies = (Currencies) history.sectionMap().get(SectionHeader.CURRENCIES);

            if (report == null) {
                log.warn("No BattleReport section found in {}", file);
                return;
            }

            String battleDate = DATE_FMT.format(report.battleReportDate());
            String id = file.getId();
            String runType = battleReportDriveFile.runType();

            double cellsEarned = currencies != null
                    ? toRaw(currencies.cellsEarned())
                    : 0.0;
            double cellsPerHour = toRaw(report.cellsPerHour());
            double coinsPerHour = toRaw(report.coinsPerHour());

            long epochSeconds = report.battleReportDate().getEpochSecond();
            String contentHash = RunRepository.computeContentHash(epochSeconds, report.realTime().getSeconds(), report.gameTime().getSeconds(), report.tier(), report.wave());

            if (runRepository.existsByContentHash(contentHash)) {
                log.warn("Skipping duplicate report: {} (file={}) — content already indexed (hash={})", id, filename, contentHash);
                return;
            }

            String payload = objectMapper.writeValueAsString(history);

            try {
                runRepository.insert(
                        id, filename, runType, null, battleDate,
                        report.tier(), report.wave(),
                        cellsEarned,
                        report.realTime().getSeconds(),
                        report.gameTime().getSeconds(),
                        cellsPerHour, coinsPerHour,
                        report.killedBy(),
                        report.towerEra(),
                        payload,
                        epochSeconds);
                tierPersonalBestService.recordResult(report.tier(), runType, null, report.wave());
                log.info("Indexed report: {} -> {}/{}", id, runType, filename);
            } catch (DuplicateKeyException e) {
                log.warn("Duplicate report rejected by unique constraint: {} (file={}, hash={})", id, filename, contentHash);
            }
        } catch (Exception e) {
            // Skip this report and continue the batch — a single malformed/unparseable
            // report (e.g. a new game version adding stat fields) must not abort ingestion
            // of every other file.
            log.error("Failed to parse report, skipping: {}", filename, e);
        }
    }

    private double toRaw(com.pphi.tower.model.TowerNumber tn) {
        if (tn == null || tn.amount() == null) return 0.0;
        if (tn.scaleSuffix() == null) return tn.amount().doubleValue();
        return tn.amount().multiply(tn.scaleSuffix().getScientificNotation()).doubleValue();
    }
}
