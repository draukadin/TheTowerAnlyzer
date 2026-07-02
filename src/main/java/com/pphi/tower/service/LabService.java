package com.pphi.tower.service;

import com.pphi.tower.repository.LabRepository;
import com.pphi.tower.util.ShortestLabUtil;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
public class LabService {

    private final LabRepository labRepository;

    public LabService(LabRepository labRepository) {
        this.labRepository = labRepository;
    }

    public Map<Long, LabRepository.LabLevelCost> shortestLabsToMax(
            final int maxDurationDays,
            final double cellSpeedMulti) {
        final List<LabRepository.LabData> labs = labRepository.getAll();
        final Map<Long, List<LabRepository.LabLevelCost>> costs = labRepository.getAllCosts();
        final LabRepository.LabMultipliers multipliers = labRepository.getMultipliers();
        return ShortestLabUtil.computeShortestLabsToMax(labs, costs, multipliers, maxDurationDays, cellSpeedMulti);
    }
}
