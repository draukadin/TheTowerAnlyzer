package com.pphi.tower.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pphi.tower.config.AwsProperties;
import com.pphi.tower.db.ContentDefinitions;
import com.pphi.tower.repository.S3ContentPatchRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.services.s3.S3Client;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Fetches a lab/workshop content patch from the player's own S3 mailbox
 * ({@code <player_id>/content/}), applies it via {@link ContentPatchApplier}, and deletes the
 * objects once successfully applied. See {@code designs/} plan for issue #47 — this replaces
 * "cut a new app release" with "publish JSON, every centralized install picks it up."
 */
@Service
@ConditionalOnBean(S3Client.class)
public class ContentPatchService {

    private static final Logger log = LoggerFactory.getLogger(ContentPatchService.class);

    private static final String MANIFEST            = "manifest.json";
    private static final String LAB_DEFINITIONS      = "lab_definitions.json";
    private static final String LAB_COSTS            = "lab_costs.json";
    private static final String WORKSHOP_DEFINITIONS = "workshop_definitions.json";
    private static final String WORKSHOP_COSTS       = "workshop_costs.json";
    private static final String WORKSHOP_PLUS_COSTS  = "workshop_plus_costs.json";
    private static final String WORKSHOP_VALUES      = "workshop_values.json";
    private static final String ENHANCEMENT_VALUES   = "enhancement_values.json";

    private static final List<String> CONTENT_FILES = List.of(
            LAB_DEFINITIONS, LAB_COSTS, WORKSHOP_DEFINITIONS,
            WORKSHOP_COSTS, WORKSHOP_PLUS_COSTS, WORKSHOP_VALUES, ENHANCEMENT_VALUES);

    private final AwsProperties aws;
    private final S3ContentPatchRepository repo;
    private final ContentPatchApplier applier;
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper = new ObjectMapper();

    public ContentPatchService(AwsProperties aws, S3ContentPatchRepository repo,
                                ContentPatchApplier applier, JdbcTemplate jdbc) {
        this.aws = aws;
        this.repo = repo;
        this.applier = applier;
        this.jdbc = jdbc;
    }

    public record Result(boolean upToDate, int appliedVersion, int labsAdded, int labsUpdated,
                          int workshopItemsAdded, int workshopItemsUpdated) {}

    private record Manifest(int contentVersion) {}

    /** Best-effort check on every startup — never blocks app startup, never throws out. */
    @EventListener(ApplicationReadyEvent.class)
    public void onStartup() {
        if (!aws.isConfigured()) return;
        Thread.ofVirtual().name("content-patch-startup-check").start(() -> {
            try {
                Result result = checkAndApply();
                if (!result.upToDate()) {
                    log.info("Applied content patch v{}: {} labs added, {} labs updated, "
                                    + "{} workshop items added, {} workshop items updated",
                            result.appliedVersion(), result.labsAdded(), result.labsUpdated(),
                            result.workshopItemsAdded(), result.workshopItemsUpdated());
                }
            } catch (Exception e) {
                log.warn("Startup content patch check failed (will retry next launch): {}", e.getMessage());
            }
        });
    }

    /**
     * Checks the player's S3 mailbox for a newer content patch and applies it. Downloads and
     * validates every file before writing anything to the database (reject-whole-patch on any
     * failure); only deletes the S3 objects after a fully successful apply.
     */
    public Result checkAndApply() {
        String bucket = aws.getS3Bucket();
        String prefix = aws.getPlayerId() + "/content/";
        int applied = appliedVersion();

        String manifestJson = repo.downloadAsString(bucket, prefix + MANIFEST);
        if (manifestJson == null) {
            return new Result(true, applied, 0, 0, 0, 0);
        }

        Manifest manifest = parseManifest(manifestJson);
        if (manifest.contentVersion() <= applied) {
            return new Result(true, applied, 0, 0, 0, 0);
        }

        Map<String, String> files = new HashMap<>();
        for (String filename : CONTENT_FILES) {
            String content = repo.downloadAsString(bucket, prefix + filename);
            if (content == null) {
                throw new IllegalStateException(
                        "Content patch v" + manifest.contentVersion() + " is missing " + filename);
            }
            files.put(filename, content);
        }

        List<ContentDefinitions.LabDefinition> labDefs =
                ContentDefinitions.readLabDefinitions(resourceFor(files.get(LAB_DEFINITIONS)));
        Map<String, Map<String, ContentDefinitions.LabCostEntry>> labCosts =
                ContentDefinitions.readLabCosts(resourceFor(files.get(LAB_COSTS)));
        ContentDefinitions.WorkshopDefinitions workshopDefs =
                ContentDefinitions.readWorkshopDefinitions(resourceFor(files.get(WORKSHOP_DEFINITIONS)));
        Map<String, Map<String, Double>> workshopCosts =
                ContentDefinitions.readNumericMap(resourceFor(files.get(WORKSHOP_COSTS)));
        Map<String, Map<String, Double>> workshopPlusCosts =
                ContentDefinitions.readNumericMap(resourceFor(files.get(WORKSHOP_PLUS_COSTS)));
        Map<String, Map<String, Double>> workshopValues =
                ContentDefinitions.readNumericMap(resourceFor(files.get(WORKSHOP_VALUES)));
        Map<String, Map<String, Double>> enhancementValues =
                ContentDefinitions.readNumericMap(resourceFor(files.get(ENHANCEMENT_VALUES)));

        validate(labDefs, workshopDefs);

        ContentPatchApplier.Summary summary = applier.apply(
                manifest.contentVersion(), labDefs, labCosts, workshopDefs,
                workshopCosts, workshopPlusCosts, workshopValues, enhancementValues);

        for (String filename : CONTENT_FILES) {
            repo.deleteObject(bucket, prefix + filename);
        }
        repo.deleteObject(bucket, prefix + MANIFEST);

        return new Result(false, manifest.contentVersion(), summary.labsAdded(), summary.labsUpdated(),
                summary.workshopItemsAdded(), summary.workshopItemsUpdated());
    }

    public int appliedVersion() {
        Integer v = jdbc.queryForObject("SELECT applied_version FROM content_patch_state WHERE id = 1", Integer.class);
        return v != null ? v : 0;
    }

    private Manifest parseManifest(String json) {
        try {
            return mapper.readValue(json, Manifest.class);
        } catch (Exception e) {
            throw new IllegalStateException("Malformed content manifest: " + e.getMessage(), e);
        }
    }

    private static Resource resourceFor(String content) {
        return new ByteArrayResource(content.getBytes(StandardCharsets.UTF_8));
    }

    /** Reject the whole patch (never write anything) if any of it looks malformed. */
    private void validate(List<ContentDefinitions.LabDefinition> labDefs,
                           ContentDefinitions.WorkshopDefinitions workshopDefs) {
        for (var def : labDefs) {
            if (def.name() == null || def.name().isBlank())
                throw new IllegalArgumentException("Lab definition missing name");
            if (def.category() == null || def.category().isBlank())
                throw new IllegalArgumentException("Lab '" + def.name() + "' missing category");
            if (def.maxLevel() <= 0)
                throw new IllegalArgumentException("Lab '" + def.name() + "' has non-positive maxLevel");
        }

        Set<String> groupKeys = new HashSet<>();
        for (var g : workshopDefs.unlockGroups()) {
            if (g.key() == null || g.key().isBlank())
                throw new IllegalArgumentException("Workshop unlock group missing key");
            if (g.categoryId() < 1 || g.categoryId() > 3)
                throw new IllegalArgumentException("Workshop unlock group '" + g.key() + "' has invalid categoryId");
            if (g.unlockCost() < 0)
                throw new IllegalArgumentException("Workshop unlock group '" + g.key() + "' has negative unlockCost");
            groupKeys.add(g.key());
        }
        for (var i : workshopDefs.items()) {
            if (i.name() == null || i.name().isBlank())
                throw new IllegalArgumentException("Workshop item missing name");
            if (i.categoryId() < 1 || i.categoryId() > 3)
                throw new IllegalArgumentException("Workshop item '" + i.name() + "' has invalid categoryId");
            if (i.isPlus() != 0 && i.isPlus() != 1)
                throw new IllegalArgumentException("Workshop item '" + i.name() + "' has invalid isPlus");
            if (i.maxLevel() <= 0)
                throw new IllegalArgumentException("Workshop item '" + i.name() + "' has non-positive maxLevel");
            if (i.unlockGroupKey() != null && !groupKeys.contains(i.unlockGroupKey()))
                throw new IllegalArgumentException(
                        "Workshop item '" + i.name() + "' references unknown unlock group '" + i.unlockGroupKey() + "'");
        }
    }
}
