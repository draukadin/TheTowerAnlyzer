package com.pphi.tower.util;

import java.nio.file.Path;

/**
 * Resolves the OS-appropriate per-user data directory for TheTowerAnalyzer
 * (database, backups, user.properties, bundled adb tools), so the app is not
 * hardwired to Windows' {@code %APPDATA%}.
 */
public final class AppDirectories {

    private static final String APP_FOLDER = "TheTowerAnalyzer";

    private AppDirectories() {}

    public static boolean isWindows() {
        return osName().contains("win");
    }

    public static boolean isMac() {
        return osName().contains("mac") || osName().contains("darwin");
    }

    private static String osName() {
        return System.getProperty("os.name", "").toLowerCase();
    }

    /** Root directory for all app data — analogous to Windows' {@code %APPDATA%\TheTowerAnalyzer}. */
    public static Path dataDir() {
        if (isWindows()) {
            return Path.of(System.getenv("APPDATA"), APP_FOLDER);
        }
        if (isMac()) {
            return Path.of(System.getProperty("user.home"), "Library", "Application Support", APP_FOLDER);
        }
        String xdgDataHome = System.getenv("XDG_DATA_HOME");
        Path base = (xdgDataHome != null && !xdgDataHome.isBlank())
                ? Path.of(xdgDataHome)
                : Path.of(System.getProperty("user.home"), ".local", "share");
        return base.resolve(APP_FOLDER);
    }

    /** Name of a native executable on this OS, e.g. {@code exeName("node")} -> {@code "node.exe"} on Windows. */
    public static String exeName(String baseName) {
        return isWindows() ? baseName + ".exe" : baseName;
    }
}
