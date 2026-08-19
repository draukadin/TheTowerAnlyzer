package com.pphi.tower.web;

import com.pphi.tower.model.DissonanceType;
import com.pphi.tower.repository.LabRepository;
import com.pphi.tower.repository.TierPersonalBestRepository;
import com.pphi.tower.repository.TierPersonalBestRepository.TierPb;
import com.pphi.tower.util.DissonanceBoostUtility;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/tier-pb")
@CrossOrigin(origins = "*")
public class TierPersonalBestController {

    private final TierPersonalBestRepository repository;
    private final LabRepository labRepository;

    public TierPersonalBestController(TierPersonalBestRepository repository, LabRepository labRepository) {
        this.repository = repository;
        this.labRepository = labRepository;
    }

    @GetMapping
    public Map<String, Object> getAll() {
        List<TierPb> rows = repository.findAll();

        int echoAttack  = getEchoLevel("Dissonant Echo - Attack");
        int echoDefense = getEchoLevel("Dissonant Echo - Defense");
        int echoUtility = getEchoLevel("Dissonant Echo - Utility");
        int echoUw      = getEchoLevel("Dissonant Echo - Ultimate Weapons");

        List<Integer> allAttack  = rows.stream().map(TierPb::attackWaves).toList();
        List<Integer> allDefense = rows.stream().map(TierPb::defenseWaves).toList();
        List<Integer> allUtility = rows.stream().map(TierPb::utilityWaves).toList();
        List<Integer> allUw      = rows.stream().map(TierPb::uwWaves).toList();

        List<Map<String, Object>> enriched = rows.stream().map(r -> {
            Map<String, Object> row = new HashMap<>();
            row.put("tier",         r.tier());
            row.put("wave",         r.wave());
            row.put("attackWaves",  r.attackWaves());
            row.put("defenseWaves", r.defenseWaves());
            row.put("utilityWaves", r.utilityWaves());
            row.put("uwWaves",      r.uwWaves());
            row.put("attackBoost",  compute(r.attackWaves(),  allAttack,  echoAttack,  DissonanceType.ATTACK));
            row.put("defenseBoost", compute(r.defenseWaves(), allDefense, echoDefense, DissonanceType.DEFENSE));
            row.put("utilityBoost", compute(r.utilityWaves(), allUtility, echoUtility, DissonanceType.UTILITY));
            row.put("uwBoost",      compute(r.uwWaves(),      allUw,      echoUw,      DissonanceType.UW));
            return row;
        }).toList();

        return Map.of(
            "echoLevels", Map.of(
                "attack",  echoAttack,
                "defense", echoDefense,
                "utility", echoUtility,
                "uw",      echoUw
            ),
            "tournamentBoost", Map.of(
                "attack",  compute(0, allAttack,  echoAttack,  DissonanceType.ATTACK),
                "defense", compute(0, allDefense, echoDefense, DissonanceType.DEFENSE),
                "utility", compute(0, allUtility, echoUtility, DissonanceType.UTILITY),
                "uw",      compute(0, allUw,      echoUw,      DissonanceType.UW)
            ),
            "tiers", enriched
        );
    }

    @PostMapping("/{tier}")
    public ResponseEntity<Void> createTier(@PathVariable int tier) {
        repository.createTier(tier);
        return ResponseEntity.ok().build();
    }

    @PatchMapping("/{tier}/wave")
    public ResponseEntity<Void> updateWave(@PathVariable int tier, @RequestBody Map<String, Integer> body) {
        repository.updateWave(tier, body.getOrDefault("wave", 0));
        return ResponseEntity.ok().build();
    }

    @PatchMapping("/{tier}/dissonance")
    public ResponseEntity<Void> updateDissonance(@PathVariable int tier, @RequestBody Map<String, Object> body) {
        DissonanceType type = DissonanceType.valueOf((String) body.get("type"));
        int waves = body.containsKey("waves") ? ((Number) body.get("waves")).intValue() : 0;
        repository.updateDissonanceWaves(tier, type, waves);
        return ResponseEntity.ok().build();
    }

    /**
     * Projects the dissonance boost a tier would have at a hypothetical wave count, without
     * writing it to the DB. Every other tier's real personal best still feeds the "others" pool,
     * only {@code tier} is swapped for {@code waves}. Lets callers answer "what wave do I need to
     * beat tier X" by probing this instead of extrapolating from the wave-to-boost curve, which is
     * not linear (see {@link DissonanceBoostUtility#DEPTH_CURVE}).
     */
    @GetMapping("/simulate")
    public Map<String, Object> simulateDissonance(
            @RequestParam int tier,
            @RequestParam DissonanceType type,
            @RequestParam int waves) {
        List<TierPb> rows = repository.findAll();
        List<Integer> allWaves = new ArrayList<>(rows.stream()
                .filter(r -> r.tier() != tier)
                .map(r -> wavesFor(r, type))
                .toList());
        allWaves.add(waves);
        int echoLevel = getEchoLevel(echoLabName(type));
        BigDecimal boost = DissonanceBoostUtility.compute(waves, allWaves, echoLevel, type);
        return Map.of("tier", tier, "type", type, "waves", waves, "boost", boost);
    }

    private static int wavesFor(TierPb r, DissonanceType type) {
        return switch (type) {
            case ATTACK -> r.attackWaves();
            case DEFENSE -> r.defenseWaves();
            case UTILITY -> r.utilityWaves();
            case UW -> r.uwWaves();
        };
    }

    private static String echoLabName(DissonanceType type) {
        return switch (type) {
            case ATTACK -> "Dissonant Echo - Attack";
            case DEFENSE -> "Dissonant Echo - Defense";
            case UTILITY -> "Dissonant Echo - Utility";
            case UW -> "Dissonant Echo - Ultimate Weapons";
        };
    }

    private int getEchoLevel(String labName) {
        return labRepository.getAll().stream()
                .filter(l -> labName.equals(l.name()))
                .mapToInt(LabRepository.LabData::currentLevel)
                .findFirst()
                .orElse(0);
    }

    private static BigDecimal compute(int tierWaves, List<Integer> allWaves, int echoLevel, DissonanceType type) {
        return DissonanceBoostUtility.compute(tierWaves, allWaves, echoLevel, type);
    }
}
