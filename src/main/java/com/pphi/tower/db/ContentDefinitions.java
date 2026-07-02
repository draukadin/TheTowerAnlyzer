package com.pphi.tower.db;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;

import java.io.IOException;
import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Reads lab/workshop content JSON — bundled on the classpath for fresh installs, or from a
 * downloaded {@link Resource} when applying a remote content patch (ContentPatchService), so
 * both paths share one parser and can never drift out of sync.
 */
public final class ContentDefinitions {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private ContentDefinitions() {}

    public record LabDefinition(String name, String category, int maxLevel) {}

    public record WorkshopUnlockGroupDefinition(String key, int categoryId, long unlockCost) {}

    public record WorkshopItemDefinition(
            String name, int categoryId, int isPlus, int sortOrder, int maxLevel,
            String unlockGroupKey, String plusUnlockLabName, Double plusUnlockCumulativeSpend) {}

    public record WorkshopDefinitions(
            List<WorkshopUnlockGroupDefinition> unlockGroups, List<WorkshopItemDefinition> items) {}

    /** One row of {@code lab_costs.json}: {@code {"dur": 599, "cost": 300}}. */
    public record LabCostEntry(Integer durationSeconds, Double coinCost) {}

    public static List<LabDefinition> readLabDefinitions() {
        return readLabDefinitions(new ClassPathResource("lab_definitions.json"));
    }

    public static List<LabDefinition> readLabDefinitions(Resource resource) {
        try (InputStream in = resource.getInputStream()) {
            return MAPPER.readValue(in, new TypeReference<List<LabDefinition>>() {});
        } catch (IOException e) {
            throw new RuntimeException("Failed to read lab definitions from " + resource, e);
        }
    }

    public static WorkshopDefinitions readWorkshopDefinitions() {
        return readWorkshopDefinitions(new ClassPathResource("workshop_definitions.json"));
    }

    public static WorkshopDefinitions readWorkshopDefinitions(Resource resource) {
        try (InputStream in = resource.getInputStream()) {
            return MAPPER.readValue(in, WorkshopDefinitions.class);
        } catch (IOException e) {
            throw new RuntimeException("Failed to read workshop definitions from " + resource, e);
        }
    }

    /** Parses {@code lab_costs.json}: {@code { "Lab Name": { "1": {"dur":599,"cost":300}, ... } } }. */
    public static Map<String, Map<String, LabCostEntry>> readLabCosts(Resource resource) {
        try (InputStream in = resource.getInputStream()) {
            Map<String, Map<String, Map<String, Object>>> raw =
                    MAPPER.readValue(in, new TypeReference<>() {});
            Map<String, Map<String, LabCostEntry>> result = new LinkedHashMap<>();
            for (var labEntry : raw.entrySet()) {
                Map<String, LabCostEntry> levels = new LinkedHashMap<>();
                for (var levelEntry : labEntry.getValue().entrySet()) {
                    Map<String, Object> row = levelEntry.getValue();
                    Integer dur = row.get("dur") != null ? ((Number) row.get("dur")).intValue() : null;
                    Double cost = row.get("cost") != null ? ((Number) row.get("cost")).doubleValue() : null;
                    levels.put(levelEntry.getKey(), new LabCostEntry(dur, cost));
                }
                result.put(labEntry.getKey(), levels);
            }
            return result;
        } catch (IOException e) {
            throw new RuntimeException("Failed to read lab costs from " + resource, e);
        }
    }

    /**
     * Parses the {@code { "Item Name": { "1": 10.0, "2": 12.0, ... } } } shape shared by
     * {@code workshop_costs.json}, {@code workshop_plus_costs.json}, {@code workshop_values.json},
     * and {@code enhancement_values.json}.
     */
    public static Map<String, Map<String, Double>> readNumericMap(Resource resource) {
        try (InputStream in = resource.getInputStream()) {
            Map<String, Map<String, Number>> raw = MAPPER.readValue(in, new TypeReference<>() {});
            Map<String, Map<String, Double>> result = new LinkedHashMap<>();
            for (var entry : raw.entrySet()) {
                Map<String, Double> levels = new LinkedHashMap<>();
                for (var levelEntry : entry.getValue().entrySet()) {
                    levels.put(levelEntry.getKey(), levelEntry.getValue().doubleValue());
                }
                result.put(entry.getKey(), levels);
            }
            return result;
        } catch (IOException e) {
            throw new RuntimeException("Failed to read numeric content map from " + resource, e);
        }
    }
}
