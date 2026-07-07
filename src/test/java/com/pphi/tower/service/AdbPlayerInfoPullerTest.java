package com.pphi.tower.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

class AdbPlayerInfoPullerTest {

    @ParameterizedTest
    @CsvSource(delimiterString = "|", value = {
            "error: no devices/emulators found|No device connected",
            "error: device unauthorized|not authorized",
            "error: more than one device/emulator|Multiple devices connected",
            "adb: error: failed to stat remote object 'x': No such file or directory|not found on device",
            "adb: error: remote object 'x' does not exist|not found on device"
    })
    void mapAdbError_returnsFriendlyMessage_forKnownFailures(String rawOutput, String expectedSubstring) {
        assertThat(AdbPlayerInfoPuller.mapAdbError(rawOutput, 1)).contains(expectedSubstring);
    }

    @Test
    void mapAdbError_returnsGenericMessage_forUnknownFailure() {
        String result = AdbPlayerInfoPuller.mapAdbError("some unexpected adb output", 1);
        assertThat(result).contains("adb pull failed").contains("some unexpected adb output");
    }
}
