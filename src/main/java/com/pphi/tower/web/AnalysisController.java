package com.pphi.tower.web;

import com.pphi.tower.config.AppConfig;
import com.pphi.tower.service.CellIncomeService;
import com.pphi.tower.service.GtIncomeService;
import com.pphi.tower.service.IncomeTrendService;
import com.pphi.tower.service.ShardAnalysisService;
import com.pphi.tower.service.SlCoverageService;
import com.pphi.tower.web.dto.CellIncomeDto;
import com.pphi.tower.web.dto.GtIncomeProjectionDto;
import com.pphi.tower.web.dto.IncomeTrendDto;
import com.pphi.tower.web.dto.LabSpeedDto;
import com.pphi.tower.web.dto.RunFilterOptionsDto;
import com.pphi.tower.web.dto.ShardRateDto;
import com.pphi.tower.web.dto.SlCoverageEfficiencyDto;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/analysis")
@CrossOrigin(origins = "*")
public class AnalysisController {

    public enum DataSource { BATTLE_REPORTS, SNAPSHOTS }

    private final CellIncomeService cellIncomeService;
    private final ShardAnalysisService shardAnalysisService;
    private final GtIncomeService gtIncomeService;
    private final SlCoverageService slCoverageService;
    private final IncomeTrendService incomeTrendService;
    private final AppConfig config;

    public AnalysisController(CellIncomeService cellIncomeService,
                              ShardAnalysisService shardAnalysisService,
                              GtIncomeService gtIncomeService,
                              SlCoverageService slCoverageService,
                              IncomeTrendService incomeTrendService,
                              AppConfig config) {
        this.cellIncomeService = cellIncomeService;
        this.shardAnalysisService = shardAnalysisService;
        this.gtIncomeService = gtIncomeService;
        this.slCoverageService = slCoverageService;
        this.incomeTrendService = incomeTrendService;
        this.config = config;
    }

    @GetMapping("/cells")
    public CellIncomeDto getCellIncome(
            @RequestParam(required = false) Integer days) {
        int d = days != null ? days : config.getCells().getWindowDaysDefault();
        return cellIncomeService.getCellIncome(d);
    }

    @GetMapping("/shards")
    public ShardRateDto getShardRates(
            @RequestParam(required = false) Integer days,
            @RequestParam(required = false, defaultValue = "1")   int cannonLevel,
            @RequestParam(required = false, defaultValue = "1")   int armorLevel,
            @RequestParam(required = false, defaultValue = "1")   int generatorLevel,
            @RequestParam(required = false, defaultValue = "1")   int coreLevel,
            @RequestParam(required = false, defaultValue = "0")   int shardCostDiscountLevel,
            @RequestParam(required = false, defaultValue = "161") int cannonTargetLevel,
            @RequestParam(required = false, defaultValue = "161") int armorTargetLevel,
            @RequestParam(required = false, defaultValue = "161") int generatorTargetLevel,
            @RequestParam(required = false, defaultValue = "161") int coreTargetLevel,
            @RequestParam(required = false, defaultValue = "161") int targetLevel,
            @RequestParam(required = false, defaultValue = "BATTLE_REPORTS") DataSource dataSource) {
        int d = days != null ? days : config.getCells().getWindowDaysDefault();
        return switch (dataSource) {
            case SNAPSHOTS -> shardAnalysisService.getSnapshotBasedShardRates(
                    d, cannonLevel, armorLevel, generatorLevel, coreLevel,
                    shardCostDiscountLevel, targetLevel);
            default -> shardAnalysisService.getShardRates(
                    d, cannonLevel, armorLevel, generatorLevel, coreLevel,
                    shardCostDiscountLevel,
                    cannonTargetLevel, armorTargetLevel, generatorTargetLevel, coreTargetLevel);
        };
    }

    @GetMapping("/shards/snapshot-count")
    public int getSnapshotCount() {
        return shardAnalysisService.getSnapshotCount();
    }

    @GetMapping("/gt-income")
    public GtIncomeProjectionDto getGtIncomeProjection(
            @RequestParam int gtPlusLevel,
            @RequestParam double gtDurationSec,
            @RequestParam double gtCooldownSec,
            @RequestParam double kps,
            @RequestParam double totalRunDurationSec,
            @RequestParam double incomePerMob) {
        return gtIncomeService.project(gtPlusLevel, gtDurationSec, gtCooldownSec,
                kps, totalRunDurationSec, incomePerMob);
    }

    @GetMapping("/sl-coverage")
    public SlCoverageEfficiencyDto getSlCoverageEfficiency(
            @RequestParam int angleLevel,
            @RequestParam int quantityLevel,
            @RequestParam double angleDegrees,
            @RequestParam int quantityBeams,
            @RequestParam(required = false) Integer angleNextStoneCost,
            @RequestParam(required = false) Integer quantityNextStoneCost) {
        return slCoverageService.compute(angleLevel, quantityLevel, angleDegrees, quantityBeams,
                angleNextStoneCost, quantityNextStoneCost);
    }

    @GetMapping("/income-trend")
    public IncomeTrendDto getIncomeTrend(
            @RequestParam(required = false) Integer days,
            @RequestParam(required = false) List<Integer> tier,
            @RequestParam(required = false) List<String> runType) {
        return incomeTrendService.getIncomeTrend(days, tier, runType);
    }

    @GetMapping("/income-trend/filters")
    public RunFilterOptionsDto getIncomeTrendFilters() {
        return incomeTrendService.getFilterOptions();
    }

    @GetMapping("/lab-speed")
    public LabSpeedDto getLabSpeed(
            @RequestParam(required = false) Integer days,
            @RequestParam(required = false, defaultValue = "0") double cellsOnHand,
            @RequestParam(required = false, defaultValue = "0") double safetyBuffer) {
        int d = days != null ? days : config.getCells().getWindowDaysDefault();
        return cellIncomeService.getLabSpeedAffordability(d, cellsOnHand, safetyBuffer);
    }
}
