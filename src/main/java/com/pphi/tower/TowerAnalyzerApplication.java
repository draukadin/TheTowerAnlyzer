package com.pphi.tower;

import com.pphi.tower.config.AwsProperties;
import com.pphi.tower.config.DriveProperties;
import com.pphi.tower.config.SheetProperties;
import com.pphi.tower.util.AppDirectories;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.context.WebServerInitializedEvent;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Bean;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.awt.Desktop;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

@SpringBootApplication
@EnableConfigurationProperties
@EnableCaching
@EnableScheduling
public class TowerAnalyzerApplication {

    private static final Logger log = LoggerFactory.getLogger(TowerAnalyzerApplication.class);

    public static void main(String[] args) throws IOException {
        boolean seedMode = "seed".equals(System.getProperty("spring.profiles.active"));
        if (!seedMode) {
            installBundledDatabaseIfAbsent();
            installBundledAdbToolsIfAbsent();
            applyStagedRestoreIfPresent();
            installUserPropertiesIfAbsent();
        }
        String version = TowerAnalyzerApplication.class.getPackage().getImplementationVersion();
        log.info("Starting TheTowerAnalyzer version {}", version != null ? version : "unknown (dev build)");
        SpringApplication app = new SpringApplication(TowerAnalyzerApplication.class);
        if (args.length > 0) {
            app.setWebApplicationType(WebApplicationType.NONE);
        }
        app.run(args);
    }

    /**
     * Copies the bundled analyzer.db from the classpath to {@link AppDirectories#dataDir()}
     * before Spring (and HikariCP) start up. This must happen before any datasource
     * bean is initialized, so it cannot live in a Spring component.
     */
    private static void installBundledDatabaseIfAbsent() throws IOException {
        Path dir    = AppDirectories.dataDir();
        Path dbFile = dir.resolve("analyzer.db");
        Files.createDirectories(dir);
        if (!Files.exists(dbFile)) {
            try (InputStream bundled = TowerAnalyzerApplication.class.getResourceAsStream("/analyzer.db")) {
                if (bundled != null) {
                    log.info("First run detected — copying bundled database to {}", dbFile);
                    Files.copy(bundled, dbFile, StandardCopyOption.REPLACE_EXISTING);
                    log.info("Bundled database installed successfully.");
                } else {
                    log.info("First run detected — no bundled database found, seeding from scratch.");
                }
            }
        }
    }

    /**
     * Copies the bundled adb tools for this OS (adb binary, plus Windows' two USB DLLs
     * where applicable, plus the platform-tools NOTICE.txt) from the classpath to
     * {@link AppDirectories#dataDir()}{@code \tools\adb}, so the "Import from Device"
     * feature works without requiring the user to install the Android SDK.
     */
    private static void installBundledAdbToolsIfAbsent() throws IOException {
        Path dir = AppDirectories.dataDir().resolve("tools").resolve("adb");
        Files.createDirectories(dir);
        String adbBinaryName = AppDirectories.exeName("adb");
        Path adbExe = dir.resolve(adbBinaryName);
        if (!Files.exists(adbExe)) {
            String platformDir = AppDirectories.isWindows() ? "win" : AppDirectories.isMac() ? "mac" : "linux";
            String[] files = AppDirectories.isWindows()
                    ? new String[]{"adb.exe", "AdbWinApi.dll", "AdbWinUsbApi.dll", "NOTICE.txt"}
                    : new String[]{"adb", "NOTICE.txt"};
            log.info("First run detected — installing bundled adb tools to {}", dir);
            for (String name : files) {
                try (InputStream bundled = TowerAnalyzerApplication.class.getResourceAsStream("/tools/adb/" + platformDir + "/" + name)) {
                    if (bundled != null) {
                        Path dest = dir.resolve(name);
                        Files.copy(bundled, dest, StandardCopyOption.REPLACE_EXISTING);
                        if (!AppDirectories.isWindows() && "adb".equals(name)) {
                            dest.toFile().setExecutable(true);
                        }
                    } else {
                        log.warn("Bundled adb resource /tools/adb/{}/{} not found on classpath.", platformDir, name);
                    }
                }
            }
            log.info("Bundled adb tools installed successfully.");
        }
    }

    /**
     * Applies a staged database restore (centralized mode, Action item 8) before Spring
     * and HikariCP open the datasource. A restore downloaded from S3 is written to
     * {@code analyzer.db.restore}; on the next startup we move the current db aside and
     * swap the staged file into place. This must happen before any datasource bean is
     * initialized — SQLite holds {@code analyzer.db} open (WAL) for the life of the
     * process, so it cannot be swapped live and cannot live in a Spring component.
     */
    private static void applyStagedRestoreIfPresent() throws IOException {
        Path dir     = AppDirectories.dataDir();
        Path staged  = dir.resolve("analyzer.db.restore");
        if (!Files.exists(staged)) {
            return;
        }
        Path dbFile  = dir.resolve("analyzer.db");
        Path aside   = dir.resolve("analyzer.db.pre-restore");
        log.info("Staged database restore detected at {} — applying before startup", staged);

        if (Files.exists(dbFile)) {
            // Delete WAL sidecars first — they are memory-mapped by SQLite and can hold
            // locks that outlive the owning process on Windows.
            Files.deleteIfExists(dir.resolve("analyzer.db-wal"));
            Files.deleteIfExists(dir.resolve("analyzer.db-shm"));

            // Retry rename-aside for up to 30 s. Log any live Java processes each attempt
            // so the user can see whether the previous instance is still shutting down.
            long deadline = System.currentTimeMillis() + 30_000;
            boolean renamed = false;
            while (!renamed) {
                try {
                    Files.move(dbFile, aside, StandardCopyOption.REPLACE_EXISTING);
                    renamed = true;
                } catch (IOException ex) {
                    if (System.currentTimeMillis() >= deadline) {
                        // Last resort: copy-overwrite in place.  The pre-restore backup cannot
                        // be preserved locally, but the original is safely stored in S3.
                        log.warn("Database still locked after 30 s — overwriting in place (original in S3).");
                        Files.copy(staged, dbFile, StandardCopyOption.REPLACE_EXISTING);
                        Files.deleteIfExists(staged);
                        log.info("Database restore applied (copy-overwrite).");
                        return;
                    }
                    ProcessHandle.allProcesses()
                        .filter(p -> p.info().command().map(c -> c.toLowerCase().contains("java")).orElse(false))
                        .forEach(p -> log.warn("  Java process still alive — PID {}: {}",
                            p.pid(), p.info().commandLine().orElse("(unknown)")));
                    log.warn("Database locked ({}); retrying in 500 ms…", ex.getMessage());
                    try { Thread.sleep(500); } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        throw ex;
                    }
                }
            }
        }
        Files.move(staged, dbFile, StandardCopyOption.REPLACE_EXISTING);
        log.info("Database restore applied. Previous database preserved at {}", aside);
    }

    private static void installUserPropertiesIfAbsent() throws IOException {
        Path dir   = AppDirectories.dataDir();
        Path props = dir.resolve("user.properties");
        Files.createDirectories(dir);
        if (!Files.exists(props)) {
            log.info("First run detected — creating user.properties template at {}", props);
            String content = String.join(System.lineSeparator(),
                "# Optional: change the port if 8080 is already in use on your machine",
                "# server.port=8080"
            );
            Files.writeString(props, content);
            log.info("user.properties created. Set aws.player-id in {} before restarting.", props);
        }
    }

    @EventListener(WebServerInitializedEvent.class)
    public void openBrowser(WebServerInitializedEvent event) {
        int port = event.getWebServer().getPort();
        String url = "http://localhost:" + port;
        try {
            if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                Desktop.getDesktop().browse(URI.create(url));
            } else if (AppDirectories.isWindows()) {
                // Fallback for headless/non-Desktop environments (e.g. --win-console mode)
                new ProcessBuilder("rundll32", "url.dll,FileProtocolHandler", url).start();
            } else if (AppDirectories.isMac()) {
                new ProcessBuilder("open", url).start();
            } else {
                new ProcessBuilder("xdg-open", url).start();
            }
        } catch (Exception e) {
            log.warn("Could not open browser automatically: {}", e.getMessage());
        }
    }

    @Bean
    public ApplicationRunner startupConfigLogger(DriveProperties drive, SheetProperties sheet, AwsProperties awsProperties) {
        return args -> {
            String userPropsPath = AppDirectories.dataDir().resolve("user.properties").toString();
            log.info("Loading user config from: {}", userPropsPath);
            log.info("drive.oauth-credentials-file   = {}", drive.getOauthCredentialsFile());
            log.info("drive.tokens-dir               = {}", drive.getTokensDir());
            log.info("drive.application-name         = {}", drive.getApplicationName());
            log.info("drive.battle-reports-folder-id = {}", drive.getBattleReportsFolderId() != null ? drive.getBattleReportsFolderId() : "(NOT SET)");
            log.info("drive.backup-folder-id         = {}", drive.getBackupFolderId() != null ? drive.getBackupFolderId() : "(NOT SET)");
            log.info("sheets.ids.player-tracker      = {}", sheet.getIds().get("player-tracker") != null ? sheet.resolve("player-tracker") : "(NOT SET)");
            log.info("aws.player-id                  = {}", awsProperties.getPlayerId());
        };
    }
}
