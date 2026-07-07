package com.pphi.tower.web;

import com.pphi.tower.service.PlayerInfoImportService;
import com.pphi.tower.service.PlayerInfoImportService.ImportSummary;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

@RestController
@RequestMapping("/api/player-info")
@CrossOrigin(origins = "*")
public class PlayerInfoImportController {

    private final PlayerInfoImportService importService;

    public PlayerInfoImportController(PlayerInfoImportService importService) {
        this.importService = importService;
    }

    @PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ImportSummary importPlayerInfo(@RequestParam("file") MultipartFile file) throws IOException {
        return importService.importPlayerInfo(file.getBytes());
    }
}
