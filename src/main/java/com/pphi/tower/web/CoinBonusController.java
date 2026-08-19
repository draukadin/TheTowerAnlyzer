package com.pphi.tower.web;

import com.pphi.tower.service.CoinBonusService;
import com.pphi.tower.service.CoinEnhancementPayoffService;
import com.pphi.tower.web.dto.CoinBonusDto;
import com.pphi.tower.web.dto.EnhancementPaybackDto;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/coin-bonus")
@CrossOrigin(origins = "*")
public class CoinBonusController {

    private static final int DEFAULT_PRESET_ID = 1;
    private static final String DEFAULT_MODULE_PRESET = "Farming";

    private final CoinBonusService service;
    private final CoinEnhancementPayoffService payoffService;

    public CoinBonusController(CoinBonusService service, CoinEnhancementPayoffService payoffService) {
        this.service = service;
        this.payoffService = payoffService;
    }

    @GetMapping
    public CoinBonusDto getCoinBonus(
            @RequestParam int tier,
            @RequestParam(required = false, defaultValue = "" + DEFAULT_PRESET_ID) int presetId,
            @RequestParam(required = false, defaultValue = DEFAULT_MODULE_PRESET) String modulePreset) {
        return service.compute(tier, presetId, modulePreset);
    }

    @GetMapping("/enhancement-payback")
    public EnhancementPaybackDto getEnhancementPayback(
            @RequestParam int levels,
            @RequestParam(required = false) Integer days) {
        return payoffService.computePayback(levels, days);
    }
}
