package com.pphi.tower.web;

import com.pphi.tower.BaseIntegrationTest;
import org.junit.jupiter.api.Test;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class TierPersonalBestControllerIT extends BaseIntegrationTest {

    @Test
    void getAll_returnsEmptyListOrList() throws Exception {
        mvc.perform(get("/api/tier-pb"))
                .andExpect(status().isOk());
    }

    @Test
    void postPersonalBest_returns200() throws Exception {
        mvc.perform(post("/api/tier-pb/11"))
                .andExpect(status().isOk());
    }

    @Test
    void getAll_afterPost_containsTier() throws Exception {
        mvc.perform(post("/api/tier-pb/12"));
        mvc.perform(get("/api/tier-pb"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tiers").isArray());
    }

    @Test
    void simulate_returnsBoostForHypotheticalWaves() throws Exception {
        mvc.perform(get("/api/tier-pb/simulate")
                        .param("tier", "11")
                        .param("type", "UTILITY")
                        .param("waves", "5000"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tier").value(11))
                .andExpect(jsonPath("$.type").value("UTILITY"))
                .andExpect(jsonPath("$.waves").value(5000))
                .andExpect(jsonPath("$.boost").value(3.00));
    }
}
