package com.pphi.tower.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pphi.tower.config.AwsProperties;
import com.pphi.tower.model.battlehistory.BattleHistory;
import com.pphi.tower.model.battlehistory.BattleReport;
import com.pphi.tower.model.battlehistory.Currencies;
import com.pphi.tower.model.battlehistory.SectionHeader;
import com.pphi.tower.model.s3.BattleReportS3File;
import com.pphi.tower.parser.BattleHistoryParser;
import com.pphi.tower.repository.RunRepository;
import com.pphi.tower.repository.S3ReportRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.services.s3.S3Client;

import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
@ConditionalOnBean(S3Client.class)
public class S3ReportFetcherService {

    private static final Logger log = LoggerFactory.getLogger(S3ReportFetcherService.class);
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter
            .ofPattern("yyyy-MM-dd")
            .withZone(ZoneId.of("America/Los_Angeles"));

    private final AwsProperties aws;
    private final BattleHistoryParser parser;
    private final RunRepository runRepository;
    private final S3ReportRepository s3Repository;
    private final ObjectMapper objectMapper;
    private final TierPersonalBestService tierPersonalBestService;

    public S3ReportFetcherService(
            AwsProperties aws,
            BattleHistoryParser parser,
            RunRepository runRepository,
            S3ReportRepository s3Repository,
            ObjectMapper objectMapper,
            TierPersonalBestService tierPersonalBestService) {
        this.aws = aws;
        this.parser = parser;
        this.runRepository = runRepository;
        this.s3Repository = s3Repository;
        this.objectMapper = objectMapper;
        this.tierPersonalBestService = tierPersonalBestService;
    }

    public int processReports() {
        String bucket   = aws.getS3Bucket();
        String playerId = aws.getPlayerId();

        List<String> keys = s3Repository.listKeys(bucket, playerId);
        List<String> unprocessed = keys.stream()
                .filter(k -> !runRepository.existsById(filenameFromKey(k)))
                .toList();
        unprocessed.forEach(key -> processKey(bucket, key));
        return unprocessed.size();
    }

    private void processKey(String bucket, String key) {
        try {
            String raw = s3Repository.downloadAsString(bucket, key);
            BattleReportS3File s3File = new BattleReportS3File(key, raw);
            BattleHistory history = parser.parse(s3File.contents().lines().toList());

            BattleReport report     = (BattleReport) history.sectionMap().get(SectionHeader.BATTLE_REPORT);
            Currencies   currencies = (Currencies)   history.sectionMap().get(SectionHeader.CURRENCIES);

            if (report == null) {
                log.warn("No BattleReport section in S3 key: {}", key);
                return;
            }

            String battleDate   = DATE_FMT.format(report.battleReportDate());
            long   epochSeconds = report.battleReportDate().getEpochSecond();
            String contentHash  = RunRepository.computeContentHash(epochSeconds, report.realTime().getSeconds(), report.gameTime().getSeconds(), report.tier(), report.wave());

            if (runRepository.existsByContentHash(contentHash)) {
                log.warn("Skipping duplicate S3 report: {} (hash={})", key, contentHash);
                s3Repository.markProcessed(bucket, key);
                return;
            }

            double cellsEarned  = currencies != null ? toRaw(currencies.cellsEarned()) : 0.0;
            double cellsPerHour = toRaw(report.cellsPerHour());
            double coinsPerHour = toRaw(report.coinsPerHour());
            String payload      = objectMapper.writeValueAsString(history);

            try {
                runRepository.insert(
                        s3File.filename(), s3File.filename(), s3File.runType(), s3File.dissonanceType(),
                        battleDate,
                        report.tier(), report.wave(),
                        cellsEarned,
                        report.realTime().getSeconds(),
                        report.gameTime().getSeconds(),
                        cellsPerHour, coinsPerHour,
                        report.killedBy(),
                        report.towerEra(),
                        payload,
                        epochSeconds);
                tierPersonalBestService.recordResult(report.tier(), s3File.runType(), s3File.dissonanceType(), report.wave());
                s3Repository.markProcessed(bucket, key);
                log.info("Indexed S3 report: {} -> {}", s3File.runType(), key);
            } catch (DuplicateKeyException e) {
                log.warn("Duplicate S3 report rejected by unique constraint: {} (hash={})", key, contentHash);
                s3Repository.markProcessed(bucket, key);
            }
        } catch (Exception e) {
            // Skip this report and continue the batch — a single malformed/unparseable
            // report (e.g. a new game version adding stat fields) must not abort ingestion
            // of every other key.
            log.error("Failed to process S3 report, skipping: {}", key, e);
        }
    }

    private double toRaw(com.pphi.tower.model.TowerNumber tn) {
        if (tn == null || tn.amount() == null) return 0.0;
        if (tn.scaleSuffix() == null) return tn.amount().doubleValue();
        return tn.amount().multiply(tn.scaleSuffix().getScientificNotation()).doubleValue();
    }

    private static String filenameFromKey(String key) {
        int slash = key.lastIndexOf('/');
        return slash >= 0 ? key.substring(slash + 1) : key;
    }
}
