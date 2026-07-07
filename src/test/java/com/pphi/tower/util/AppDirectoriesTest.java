package com.pphi.tower.util;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AppDirectoriesTest {

    private final String originalOsName = System.getProperty("os.name");

    @AfterEach
    void restoreOsName() {
        System.setProperty("os.name", originalOsName);
    }

    @Test
    void isWindows_detectsWindowsOsName() {
        System.setProperty("os.name", "Windows 11");
        assertThat(AppDirectories.isWindows()).isTrue();
        assertThat(AppDirectories.isMac()).isFalse();
    }

    @Test
    void isMac_detectsMacOsName() {
        System.setProperty("os.name", "Mac OS X");
        assertThat(AppDirectories.isMac()).isTrue();
        assertThat(AppDirectories.isWindows()).isFalse();
    }

    @Test
    void isMac_detectsDarwinOsName() {
        System.setProperty("os.name", "Darwin");
        assertThat(AppDirectories.isMac()).isTrue();
    }

    @Test
    void neitherWindowsNorMac_treatedAsLinux() {
        System.setProperty("os.name", "Linux");
        assertThat(AppDirectories.isWindows()).isFalse();
        assertThat(AppDirectories.isMac()).isFalse();
    }

    @Test
    void exeName_appendsExeSuffixOnlyOnWindows() {
        System.setProperty("os.name", "Windows 11");
        assertThat(AppDirectories.exeName("adb")).isEqualTo("adb.exe");

        System.setProperty("os.name", "Mac OS X");
        assertThat(AppDirectories.exeName("adb")).isEqualTo("adb");

        System.setProperty("os.name", "Linux");
        assertThat(AppDirectories.exeName("adb")).isEqualTo("adb");
    }

    @Test
    void dataDir_endsWithAppFolderName() {
        assertThat(AppDirectories.dataDir().toString()).endsWith("TheTowerAnalyzer");
    }
}
