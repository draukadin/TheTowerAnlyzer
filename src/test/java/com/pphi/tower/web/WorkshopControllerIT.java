package com.pphi.tower.web;

import com.pphi.tower.BaseIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class WorkshopControllerIT extends BaseIntegrationTest {

    @Test
    void getAll_returns200AndNonEmptyList() throws Exception {
        mvc.perform(get("/api/workshop"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(org.hamcrest.Matchers.greaterThan(0)));
    }

    @Test
    void getCosts_forFirstItem_returns200() throws Exception {
        mvc.perform(get("/api/workshop/1/costs"))
                .andExpect(status().isOk());
    }

    @Test
    void updateLevel_persists() throws Exception {
        mvc.perform(put("/api/workshop/1/level")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"level\": 3}"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/workshop"))
                .andExpect(jsonPath("$[?(@.id==1)].currentLevel").value(
                        org.hamcrest.Matchers.hasItem(3)));
    }

    @Test
    void updateLevel_clampsAboveMaxLevel() throws Exception {
        // item 11 = "Bounce Shot Chance", max_level 85 (see workshop_definitions.json)
        mvc.perform(put("/api/workshop/11/level")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"level\": 99}"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/workshop"))
                .andExpect(jsonPath("$[?(@.id==11)].currentLevel").value(
                        org.hamcrest.Matchers.hasItem(85)));
    }

    @Test
    void updateLevel_clampsBelowZero() throws Exception {
        mvc.perform(put("/api/workshop/1/level")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"level\": -5}"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/workshop"))
                .andExpect(jsonPath("$[?(@.id==1)].currentLevel").value(
                        org.hamcrest.Matchers.hasItem(0)));
    }
}
