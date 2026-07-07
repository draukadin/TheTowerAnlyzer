package com.pphi.tower.service;

import com.pphi.tower.util.AppDirectories;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;

/**
 * Pulls playerInfo.dat from a connected Android device using the adb tools bundled with
 * the app (installed to {@link AppDirectories#dataDir()}{@code \tools\adb} on first run —
 * see {@code TowerAnalyzerApplication.installBundledAdbToolsIfAbsent}), so the "Import from
 * Device" feature works without requiring the user to install the Android SDK.
 */
@Service
public class AdbPlayerInfoPuller {

    private static final Logger log = LoggerFactory.getLogger(AdbPlayerInfoPuller.class);

    private static final String REMOTE_PATH =
            "/sdcard/Android/data/com.TechTreeGames.TheTower/files/playerInfo.dat";
    private static final long TIMEOUT_SECONDS = 30;

    public byte[] pullPlayerInfoBytes() throws IOException {
        Path adbExe = resolveAdbExe();
        Path tempFile = Files.createTempFile("playerInfo", ".dat");
        try {
            Process process = new ProcessBuilder(adbExe.toString(), "pull", REMOTE_PATH, tempFile.toString())
                    .redirectErrorStream(true)
                    .start();

            String output = new String(process.getInputStream().readAllBytes());
            boolean completed = waitFor(process);
            if (!completed) {
                process.destroyForcibly();
                throw new IOException("adb pull timed out — check the device is connected and unlocked.");
            }

            int exit = process.exitValue();
            if (exit != 0 || !Files.exists(tempFile) || Files.size(tempFile) == 0) {
                throw new IOException(mapAdbError(output, exit));
            }

            log.info("Pulled playerInfo.dat from device ({} bytes)", Files.size(tempFile));
            return Files.readAllBytes(tempFile);
        } finally {
            Files.deleteIfExists(tempFile);
        }
    }

    private static boolean waitFor(Process process) throws IOException {
        try {
            return process.waitFor(TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Interrupted while waiting for adb pull.", e);
        }
    }

    private Path resolveAdbExe() throws IOException {
        Path adbExe = AppDirectories.dataDir().resolve("tools").resolve("adb")
                .resolve(AppDirectories.exeName("adb"));
        if (!Files.exists(adbExe)) {
            throw new IOException("Bundled adb not found at " + adbExe
                    + " — try restarting the app.");
        }
        return adbExe;
    }

    /**
     * Maps known adb stderr substrings to a friendly, user-facing message. Package-private
     * (and static) so it can be unit tested without shelling out to a real process.
     */
    static String mapAdbError(String output, int exitCode) {
        String lower = output.toLowerCase();
        if (lower.contains("no devices/emulators found")) {
            return "No device connected. Plug in your phone via USB with debugging enabled.";
        }
        if (lower.contains("unauthorized")) {
            return "Device not authorized — check the phone screen for an 'Allow USB debugging?' prompt.";
        }
        if (lower.contains("more than one device")) {
            return "Multiple devices connected — disconnect all but one.";
        }
        if (lower.contains("no such file") || lower.contains("does not exist")) {
            return "playerInfo.dat not found on device — has The Tower been played at least once?";
        }
        return "adb pull failed (exit " + exitCode + "): " + output.trim();
    }
}
