package com.pphi.tower.web;

import com.pphi.tower.repository.IapPurchaseRepository;
import com.pphi.tower.repository.IapPurchaseRepository.IapPurchaseData;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/iap-purchases")
@CrossOrigin(origins = "*")
public class IapPurchaseController {

    private final IapPurchaseRepository repo;

    public IapPurchaseController(IapPurchaseRepository repo) {
        this.repo = repo;
    }

    @GetMapping
    public List<IapPurchaseData> getAll() {
        return repo.getAll();
    }

    record OwnedRequest(boolean owned) {}

    @PutMapping("/{key}/owned")
    public void updateOwned(@PathVariable String key, @RequestBody OwnedRequest req) {
        repo.setOwned(key, req.owned());
    }
}
