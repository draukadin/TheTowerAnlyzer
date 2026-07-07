package com.pphi.tower.parser;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class PlayerInfoReaderTest {

    private static final Path DAT_FILE =
            Paths.get("resources/playerInfo.dat");

    @Test
    void readsKeyPlayerFields() throws IOException {
        PlayerInfoReader reader = new PlayerInfoReader(false);
        Map<String, Object> data = reader.read(DAT_FILE);

        assertFalse(data.isEmpty(), "parsed map should not be empty");

        // Spot-check a few fields expected to be present with reasonable values
        assertTrue(data.containsKey("cells"), "should contain 'cells'");
        assertTrue(data.containsKey("coins"), "should contain 'coins'");
        assertTrue(data.containsKey("gems"),  "should contain 'gems'");
        assertTrue(data.containsKey("currentTier"), "should contain 'currentTier'");

        // Lab and Workshop levels are stored as fixed-size per-category arrays (no id/name
        // attached — array index N is the Nth lab/item seeded for that category, see
        // PlayerInfoImportService). These must resolve to real int[] data, not the null
        // placeholder left by an unresolved forward MemberReference.
        assertLevelArray(data, "enhancementLevel");
        assertLevelArray(data, "enhancementDefenseLevel");
        assertLevelArray(data, "enhancementUtilityLevel");
        assertLevelArray(data, "upgradeWorkshopLevel");
        assertLevelArray(data, "upgradeWorkshopDefenseLevel");
        assertLevelArray(data, "upgradeWorkshopUtilityLevel");

        // Print all extracted values for visual inspection
        System.out.println("=== Player Data (" + data.size() + " fields) ===");

        for (Map.Entry<String, Object> entry : data.entrySet()) {
            Object val = entry.getValue();
            System.out.printf("  %-45s = %s%n", entry.getKey(), formatValue(val));
        }
    }

    private void assertLevelArray(Map<String, Object> data, String fieldName) {
        Object val = data.get(fieldName);
        assertTrue(val instanceof int[], fieldName + " should resolve to an int[], got " + val);
        assertTrue(((int[]) val).length > 0, fieldName + " should be non-empty");
    }

    private String formatValue(Object val) {
        if (val == null)          return "<null>";
        if (val instanceof Long l)  return l + " (0x" + Long.toHexString(l) + ")";
        if (val instanceof Short sh) return sh + " (0x" + Integer.toHexString(sh & 0xFFFF) + ")";
        if (val instanceof boolean[] a) return Arrays.toString(a);
        if (val instanceof long[]   a)  return Arrays.toString(a);
        if (val instanceof short[]  a)  return Arrays.toString(a);
        if (val instanceof float[]  a)  return Arrays.toString(a);
        if (val instanceof double[]  a)  return Arrays.toString(a);
        if (val instanceof int[]    a)  return Arrays.toString(a);
        return val.toString();
    }
}
