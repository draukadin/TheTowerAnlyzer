package com.pphi.tower.web;

import com.pphi.tower.service.AdbPlayerInfoPuller;
import com.pphi.tower.service.PlayerInfoImportService;
import com.pphi.tower.service.PlayerInfoImportService.ImportSummary;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;

@RestController
@RequestMapping("/api/player-info")
@CrossOrigin(origins = "*")
public class PlayerInfoImportController {

    private final PlayerInfoImportService importService;
    private final AdbPlayerInfoPuller adbPuller;

    public PlayerInfoImportController(PlayerInfoImportService importService, AdbPlayerInfoPuller adbPuller) {
        this.importService = importService;
        this.adbPuller = adbPuller;
    }

    @PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ImportSummary importPlayerInfo(@RequestParam("file") MultipartFile file) throws IOException {
        return importService.importPlayerInfo(file.getBytes());
    }

    @PostMapping("/import-from-device")
    public ImportSummary importFromDevice() throws IOException {
        byte[] bytes;
        try {
            bytes = adbPuller.pullPlayerInfoBytes();
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, e.getMessage());
        }
        return importService.importPlayerInfo(bytes);
    }
}
