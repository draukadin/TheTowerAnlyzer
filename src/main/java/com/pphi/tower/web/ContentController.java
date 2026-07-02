package com.pphi.tower.web;

import com.pphi.tower.config.AwsProperties;
import com.pphi.tower.service.ContentPatchService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@RestController
@RequestMapping("/api/content")
public class ContentController {

    private static final Logger log = LoggerFactory.getLogger(ContentController.class);

    private final AwsProperties aws;
    private final ObjectProvider<ContentPatchService> contentPatchService;

    public ContentController(AwsProperties aws, ObjectProvider<ContentPatchService> contentPatchService) {
        this.aws = aws;
        this.contentPatchService = contentPatchService;
    }

    /** Centralized mode only: current applied content version, for display in the Admin UI. */
    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> status() {
        return ResponseEntity.ok(Map.of("appliedVersion", requireService().appliedVersion()));
    }

    /** Centralized mode only: check the player's S3 mailbox and apply any newer content patch. */
    @PostMapping("/check-updates")
    public ResponseEntity<ContentPatchService.Result> checkUpdates() {
        try {
            return ResponseEntity.ok(requireService().checkAndApply());
        } catch (Exception e) {
            log.warn("Failed to check for content updates", e);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Failed to check for content updates. See server logs for details.");
        }
    }

    private ContentPatchService requireService() {
        ContentPatchService svc = contentPatchService.getIfAvailable();
        if (svc == null || !aws.isConfigured()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Content updates are not available — AWS is not configured.");
        }
        return svc;
    }
}
