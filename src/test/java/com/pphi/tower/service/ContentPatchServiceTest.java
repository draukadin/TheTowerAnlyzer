package com.pphi.tower.service;

import com.pphi.tower.config.AwsProperties;
import com.pphi.tower.db.DatabaseInitializer;
import com.pphi.tower.repository.S3ContentPatchRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ContentPatchServiceTest {

    private static final String BUCKET = "test-bucket";
    private static final String PLAYER_ID = "player-123";
    private static final String PREFIX = PLAYER_ID + "/content/";
    private static final String EMPTY_WORKSHOP_DEFS = "{\"unlockGroups\":[],\"items\":[]}";

    private JdbcTemplate jdbc;
    private S3ContentPatchRepository repo;
    private ContentPatchService service;

    @BeforeEach
    void setUp() throws Exception {
        var ds = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        jdbc = new JdbcTemplate(ds);
        new DatabaseInitializer(jdbc);
        var applier = new ContentPatchApplier(jdbc);

        AwsProperties aws = new AwsProperties();
        aws.setS3Bucket(BUCKET);
        aws.setPlayerId(PLAYER_ID);

        repo = mock(S3ContentPatchRepository.class);
        service = new ContentPatchService(aws, repo, applier, jdbc);
    }

    @Test
    void checkAndApply_noManifestInMailbox_isUpToDateNoOp() {
        when(repo.downloadAsString(BUCKET, PREFIX + "manifest.json")).thenReturn(null);

        var result = service.checkAndApply();

        assertThat(result.upToDate()).isTrue();
        assertThat(result.appliedVersion()).isZero();
        verify(repo, never()).deleteObject(any(), any());
    }

    @Test
    void checkAndApply_manifestVersionNotNewer_isNoOpAndSkipsDownloadingContentFiles() {
        when(repo.downloadAsString(BUCKET, PREFIX + "manifest.json")).thenReturn("{\"contentVersion\":0}");

        var result = service.checkAndApply();

        assertThat(result.upToDate()).isTrue();
        verify(repo, never()).downloadAsString(eq(BUCKET), eq(PREFIX + "lab_definitions.json"));
    }

    @Test
    void checkAndApply_malformedLabDefinition_rejectsWholePatchWithoutWritingOrDeleting() {
        stubAllContentFiles(1, "[{\"name\":\"\",\"category\":\"Attack\",\"maxLevel\":10}]", EMPTY_WORKSHOP_DEFS);

        assertThatThrownBy(() -> service.checkAndApply()).isInstanceOf(IllegalArgumentException.class);

        Integer version = jdbc.queryForObject("SELECT applied_version FROM content_patch_state WHERE id=1", Integer.class);
        assertThat(version).isZero();
        Integer labCount = jdbc.queryForObject("SELECT COUNT(*) FROM lab", Integer.class);
        assertThat(labCount).isZero();
        verify(repo, never()).deleteObject(any(), any());
    }

    @Test
    void checkAndApply_workshopItemReferencesUnknownUnlockGroup_rejectsWholePatch() {
        String workshopDefs = "{\"unlockGroups\":[],\"items\":[{\"name\":\"Item\",\"categoryId\":1,\"isPlus\":0,"
                + "\"sortOrder\":1,\"maxLevel\":10,\"unlockGroupKey\":\"missingGroup\","
                + "\"plusUnlockLabName\":null,\"plusUnlockCumulativeSpend\":null}]}";
        stubAllContentFiles(1, "[]", workshopDefs);

        assertThatThrownBy(() -> service.checkAndApply()).isInstanceOf(IllegalArgumentException.class);
        verify(repo, never()).deleteObject(any(), any());
    }

    @Test
    void checkAndApply_workshopUnlockGroupWithInvalidCategoryId_rejectsWholePatch() {
        String workshopDefs = "{\"unlockGroups\":[{\"key\":\"g\",\"categoryId\":9,\"unlockCost\":0}],\"items\":[]}";
        stubAllContentFiles(1, "[]", workshopDefs);

        assertThatThrownBy(() -> service.checkAndApply()).isInstanceOf(IllegalArgumentException.class);
        verify(repo, never()).deleteObject(any(), any());
    }

    @Test
    void checkAndApply_success_deletesMailboxObjectsAndPersistsAppliedVersion() {
        stubAllContentFiles(5, "[]", EMPTY_WORKSHOP_DEFS);

        var result = service.checkAndApply();

        assertThat(result.upToDate()).isFalse();
        assertThat(result.appliedVersion()).isEqualTo(5);
        Integer version = jdbc.queryForObject("SELECT applied_version FROM content_patch_state WHERE id=1", Integer.class);
        assertThat(version).isEqualTo(5);

        verify(repo).deleteObject(BUCKET, PREFIX + "manifest.json");
        verify(repo).deleteObject(BUCKET, PREFIX + "lab_definitions.json");
        verify(repo).deleteObject(BUCKET, PREFIX + "workshop_definitions.json");
    }

    @Test
    void checkAndApply_missingContentFile_rejectsPatchWithoutDeleting() {
        when(repo.downloadAsString(BUCKET, PREFIX + "manifest.json")).thenReturn("{\"contentVersion\":1}");
        when(repo.downloadAsString(eq(BUCKET), eq(PREFIX + "lab_definitions.json"))).thenReturn(null);

        assertThatThrownBy(() -> service.checkAndApply()).isInstanceOf(IllegalStateException.class);

        verify(repo, never()).deleteObject(any(), any());
    }

    private void stubAllContentFiles(int version, String labDefs, String workshopDefs) {
        when(repo.downloadAsString(BUCKET, PREFIX + "manifest.json"))
                .thenReturn("{\"contentVersion\":" + version + "}");
        when(repo.downloadAsString(BUCKET, PREFIX + "lab_definitions.json")).thenReturn(labDefs);
        when(repo.downloadAsString(BUCKET, PREFIX + "lab_costs.json")).thenReturn("{}");
        when(repo.downloadAsString(BUCKET, PREFIX + "workshop_definitions.json")).thenReturn(workshopDefs);
        when(repo.downloadAsString(BUCKET, PREFIX + "workshop_costs.json")).thenReturn("{}");
        when(repo.downloadAsString(BUCKET, PREFIX + "workshop_plus_costs.json")).thenReturn("{}");
        when(repo.downloadAsString(BUCKET, PREFIX + "workshop_values.json")).thenReturn("{}");
        when(repo.downloadAsString(BUCKET, PREFIX + "enhancement_values.json")).thenReturn("{}");
    }
}
