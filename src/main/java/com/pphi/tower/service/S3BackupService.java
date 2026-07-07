package com.pphi.tower.service;

import com.pphi.tower.config.AwsProperties;
import com.pphi.tower.model.s3.S3BackupObject;
import com.pphi.tower.repository.S3BackupRepository;
import com.pphi.tower.util.AppDirectories;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.services.s3.S3Client;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * Centralized-mode database backup/restore against the shared reports S3 bucket
 * (Action item 8). Backups live under {@code <player_id>/backups/}, writable with the
 * player's vended credentials. Conditional on an {@link S3Client} bean so legacy
 * Drive-only users never load it.
 */
@Service
@ConditionalOnBean(S3Client.class)
public class S3BackupService {

    private static final Logger log = LoggerFactory.getLogger(S3BackupService.class);
    private static final DateTimeFormatter TIMESTAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd_HH-mm-ss");

    /** Staging file applied on next restart by {@code TowerAnalyzerApplication.applyStagedRestoreIfPresent}. */
    public static final String RESTORE_STAGING_FILE = "analyzer.db.restore";

    private final AwsProperties aws;
    private final S3BackupRepository repo;

    public S3BackupService(AwsProperties aws, S3BackupRepository repo) {
        this.aws = aws;
        this.repo = repo;
    }

    /** Upload {@code analyzer.db} as the new latest backup and demote any prior latest. */
    public S3BackupObject backup() throws IOException {
        String bucket = aws.getS3Bucket();
        String prefix = backupPrefix();
        String key = prefix + "analyzer_" + LocalDateTime.now().format(TIMESTAMP) + ".db";

        Path source = databaseFile();
        Path tempCopy = Files.createTempFile("tower-backup-", ".db");
        try {
            Files.copy(source, tempCopy, StandardCopyOption.REPLACE_EXISTING);
            repo.putLatest(bucket, key, tempCopy);
            demotePreviousLatest(bucket, prefix, key);
            log.info("Backed up database to s3://{}/{}", bucket, key);
            return new S3BackupObject(key, fileName(key), Files.size(tempCopy), java.time.Instant.now(), true);
        } finally {
            Files.deleteIfExists(tempCopy);
        }
    }

    /** List backups newest-first for the restore picker. */
    public List<S3BackupObject> list() {
        return repo.listBackups(aws.getS3Bucket(), backupPrefix());
    }

    /**
     * Validate the key belongs to the caller and download it to the restore staging file.
     * The swap is applied on next restart (SQLite is held open while the app runs).
     */
    public Path stageRestore(String key) throws IOException {
        String prefix = backupPrefix();
        if (key == null || !key.startsWith(prefix) || key.contains("..") || !key.endsWith(".db")) {
            throw new IllegalArgumentException("Backup key is not under " + prefix);
        }
        Path staging = databaseDir().resolve(RESTORE_STAGING_FILE);
        try {
            repo.downloadToFile(aws.getS3Bucket(), key, staging);
        } catch (RuntimeException e) {
            Files.deleteIfExists(staging);
            throw e;
        }
        log.info("Staged restore from s3://{}/{} to {} (applies on next restart)", aws.getS3Bucket(), key, staging);
        return staging;
    }

    private void demotePreviousLatest(String bucket, String prefix, String newKey) {
        for (S3BackupObject b : repo.listBackups(bucket, prefix)) {
            if (b.latest() && !b.key().equals(newKey)) {
                repo.demote(bucket, b.key());
                log.info("Demoted previous latest backup {} (expires in 30 days)", b.key());
            }
        }
    }

    private String backupPrefix() {
        return aws.getPlayerId() + "/backups/";
    }

    private static Path databaseDir() {
        return AppDirectories.dataDir();
    }

    private static Path databaseFile() {
        return databaseDir().resolve("analyzer.db");
    }

    private static String fileName(String key) {
        int slash = key.lastIndexOf('/');
        return slash >= 0 ? key.substring(slash + 1) : key;
    }
}
