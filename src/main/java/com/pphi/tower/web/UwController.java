package com.pphi.tower.web;

import com.pphi.tower.repository.UwRepository;
import com.pphi.tower.repository.UwRepository.UwLevelsData;
import com.pphi.tower.repository.UwRepository.UwPlayerData;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/uw")
@CrossOrigin(origins = "*")
public class UwController {

    private final UwRepository uwRepository;

    public UwController(UwRepository uwRepository) {
        this.uwRepository = uwRepository;
    }

    record UnlockRequest(boolean unlocked) {}
    record LevelRequest(int level) {}

    @GetMapping
    public List<UwPlayerData> getAllUwState() {
        return uwRepository.getAllUwState();
    }

    @GetMapping("/{uwCode}/levels")
    public UwLevelsData getStatLevels(@PathVariable String uwCode) {
        UwLevelsData data = uwRepository.getStatLevels(uwCode.toUpperCase());
        if (data == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "UW not found: " + uwCode);
        return data;
    }

    @PutMapping("/{uwId}/unlocked")
    public void setUnlocked(@PathVariable int uwId, @RequestBody UnlockRequest req) {
        uwRepository.setUnlocked(uwId, req.unlocked());
    }

    @PutMapping("/{uwId}/uw-plus-unlocked")
    public void setUwPlusUnlocked(@PathVariable int uwId, @RequestBody UnlockRequest req) {
        uwRepository.setUwPlusUnlocked(uwId, req.unlocked());
    }

    @PutMapping("/stat/{statId}/level")
    public void setStatLevel(@PathVariable int statId, @RequestBody LevelRequest req) {
        uwRepository.setStatLevel(statId, req.level());
    }

    @PutMapping("/stat/{statId}/target-level")
    public void setTargetLevel(@PathVariable int statId, @RequestBody LevelRequest req) {
        uwRepository.setTargetLevel(statId, req.level());
    }
}
