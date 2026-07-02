package com.pphi.tower.web;

import com.pphi.tower.repository.LabRepository;
import com.pphi.tower.repository.LabRepository.LabData;
import com.pphi.tower.repository.LabRepository.LabLevelCost;
import com.pphi.tower.repository.LabRepository.LabMultipliers;
import com.pphi.tower.service.LabService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/labs")
@CrossOrigin(origins = "*")
public class LabController {

    private final LabRepository repo;
    private final LabService labService;

    public LabController(LabRepository repo, LabService labService) {
        this.repo = repo;
        this.labService = labService;
    }

    record StateRequest(int currentLevel, Integer targetLevel) {}

    @GetMapping
    public List<LabData> getAll(@RequestParam(required = false) String category) {
        return category != null ? repo.getByCategory(category) : repo.getAll();
    }

    @GetMapping("/search")
    public List<LabData> search(@RequestParam String q) {
        return repo.search(q);
    }

    @PutMapping("/{id}/state")
    public void updateState(@PathVariable long id, @RequestBody StateRequest req) {
        repo.updateState(id, req.currentLevel(), req.targetLevel());
    }

    @GetMapping("/costs")
    public java.util.Map<Long, List<LabLevelCost>> getAllCosts() {
        return repo.getAllCosts();
    }

    @GetMapping("/{id}/costs")
    public List<LabLevelCost> getCosts(@PathVariable long id) {
        return repo.getCosts(id);
    }

    @GetMapping("/multipliers")
    public LabMultipliers getMultipliers() {
        return repo.getMultipliers();
    }

    @GetMapping("/shortestLabs")
    public java.util.Map<Long, LabLevelCost> getShortestLabsToMax(
            @RequestParam int maxDays,
            @RequestParam double cellSpeed) {
        return labService.shortestLabsToMax(maxDays, cellSpeed);
    }
}
