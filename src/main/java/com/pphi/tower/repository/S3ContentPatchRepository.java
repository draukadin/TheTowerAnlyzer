package com.pphi.tower.repository;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.stereotype.Repository;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.S3Object;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Raw S3 access for the per-player content-patch mailbox at {@code <player_id>/content/}.
 * Conditional on an {@link S3Client} bean, so legacy Drive-only users never load it.
 */
@Repository
@ConditionalOnBean(S3Client.class)
public class S3ContentPatchRepository {

    private final S3Client s3;

    public S3ContentPatchRepository(S3Client s3) {
        this.s3 = s3;
    }

    /** List object keys under the given prefix (e.g. {@code <player_id>/content/}). */
    public List<String> listKeys(String bucket, String prefix) {
        List<String> keys = new ArrayList<>();
        String continuationToken = null;
        do {
            var req = ListObjectsV2Request.builder()
                    .bucket(bucket)
                    .prefix(prefix)
                    .continuationToken(continuationToken)
                    .build();
            var resp = s3.listObjectsV2(req);
            resp.contents().stream().map(S3Object::key).forEach(keys::add);
            continuationToken = resp.isTruncated() ? resp.nextContinuationToken() : null;
        } while (continuationToken != null);
        return keys;
    }

    /** Download an object's contents as a UTF-8 string, or {@code null} if it doesn't exist. */
    public String downloadAsString(String bucket, String key) {
        GetObjectRequest req = GetObjectRequest.builder().bucket(bucket).key(key).build();
        try (ResponseInputStream<GetObjectResponse> stream = s3.getObject(req)) {
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        } catch (NoSuchKeyException e) {
            return null;
        } catch (IOException e) {
            throw new java.io.UncheckedIOException("Failed to download " + key, e);
        }
    }

    public void deleteObject(String bucket, String key) {
        s3.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());
    }
}
