package com.pphi.tower.web.dto;

import java.util.List;

public record RunFilterOptionsDto(
        List<Integer> tiers,
        List<String> runTypes) {}
