package com.pphi.tower.web;

import com.google.api.services.drive.model.File;
import com.pphi.tower.config.AwsProperties;
import com.pphi.tower.config.DriveProperties;
import com.pphi.tower.model.s3.S3BackupObject;
import com.pphi.tower.repository.GoogleDriveRepository;
import com.pphi.tower.service.S3BackupService;
import com.pphi.tower.util.AppDirectories;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/backup")
public class BackupController {

    private static final DateTimeFormatter TIMESTAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd_HH-mm-ss");

    private final GoogleDriveRepository driveRepository;
    private final DriveProperties driveProperties;
    private final AwsProperties aws;
    private final ObjectProvider<S3BackupService> s3BackupService;

    public BackupController(GoogleDriveRepository driveRepository,
                            DriveProperties driveProperties,
                            AwsProperties aws,
                            ObjectProvider<S3BackupService> s3BackupService) {
        this.driveRepository = driveRepository;
        this.driveProperties = driveProperties;
        this.aws = aws;
        this.s3BackupService = s3BackupService;
    }

    @PostMapping("/database")
    public ResponseEntity<Map<String, String>> backupDatabase() throws Exception {
        return aws.isConfigured() ? backupToS3() : backupToDrive();
    }

    /** Centralized mode: list backups available for restore (newest first). */
    @GetMapping("/list")
    public ResponseEntity<List<S3BackupObject>> listBackups() {
        return ResponseEntity.ok(requireS3().list());
    }

    /**
     * Centralized mode: stage a restore from a backup key. The swap is applied on next
     * restart (SQLite is held open while the app runs), so the UI must prompt a restart.
     */
    @PostMapping("/restore")
    public ResponseEntity<Map<String, Object>> restore(@RequestBody Map<String, String> body) throws Exception {
        String key = body != null ? body.get("key") : null;
        try {
            requireS3().stageRestore(key);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
        return ResponseEntity.ok(Map.of(
                "key", key,
                "restartRequired", true,
                "message", "Restore staged — restart the app to apply."
        ));
    }

    private ResponseEntity<Map<String, String>> backupToS3() throws Exception {
        S3BackupObject backup = requireS3().backup();
        return ResponseEntity.ok(Map.of(
                "bucket", aws.getS3Bucket(),
                "key", backup.key(),
                "target", "s3"
        ));
    }

    private ResponseEntity<Map<String, String>> backupToDrive() throws Exception {
        Path source = AppDirectories.dataDir().resolve("analyzer.db");

        String fileName = "analyzer_" + LocalDateTime.now().format(TIMESTAMP) + ".db";
        Path tempCopy = Files.createTempFile("tower-backup-", ".db");
        try {
            Files.copy(source, tempCopy, StandardCopyOption.REPLACE_EXISTING);
            File uploaded = driveRepository.uploadFile(tempCopy.toFile(), fileName, driveProperties.getBackupFolderId());
            return ResponseEntity.ok(Map.of(
                    "fileId", uploaded.getId(),
                    "fileName", uploaded.getName(),
                    "target", "drive"
            ));
        } finally {
            Files.deleteIfExists(tempCopy);
        }
    }

    private S3BackupService requireS3() {
        S3BackupService svc = s3BackupService.getIfAvailable();
        if (svc == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "S3 backup is not available — AWS is not configured.");
        }
        return svc;
    }
}
