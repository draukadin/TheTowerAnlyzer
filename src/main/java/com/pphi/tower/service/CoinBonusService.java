package com.pphi.tower.service;

import com.pphi.tower.model.DissonanceType;
import com.pphi.tower.repository.CardRepository;
import com.pphi.tower.repository.CardRepository.CardData;
import com.pphi.tower.repository.CosmeticRepository;
import com.pphi.tower.repository.IapPurchaseRepository;
import com.pphi.tower.repository.IapPurchaseRepository.IapPurchaseData;
import com.pphi.tower.repository.LabRepository;
import com.pphi.tower.repository.StatBreakdownRepository;
import com.pphi.tower.repository.StatBreakdownRepository.StatSummary;
import com.pphi.tower.repository.TierPersonalBestRepository;
import com.pphi.tower.repository.TierPersonalBestRepository.TierPb;
import com.pphi.tower.util.DissonanceBoostUtility;
import com.pphi.tower.web.dto.CoinBonusDto;
import com.pphi.tower.web.dto.CoinBonusDto.BonusFactorDto;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Combines every multiplicative source of coin bonus into one Total Bonus figure, mirroring the
 * game's own "All Coins Bonuses" screen (issue #73): Disable Ads x Starter Pack x Epic Pack x
 * Active Cards x Modules x Difficulty Tier x Themes Bonus x Relics Bonus x Enhancement Bonus x
 * Dissonant Coin Bonus.
 */
@Service
public class CoinBonusService {

    private static final String COINS_CARD_NAME = "Coins";
    private static final String COIN_BONUS_STAT_KEY = "coin_bonus";
    private static final String COINS_KILL_BONUS_STAT_KEY = "coins_kill_bonus";
    private static final String UTILITY_ECHO_LAB = "Dissonant Echo - Utility";

    private final CardRepository cardRepository;
    private final StatBreakdownRepository statBreakdownRepository;
    private final CosmeticRepository cosmeticRepository;
    private final IapPurchaseRepository iapPurchaseRepository;
    private final TierPersonalBestRepository tierPersonalBestRepository;
    private final LabRepository labRepository;

    public CoinBonusService(CardRepository cardRepository,
                             StatBreakdownRepository statBreakdownRepository,
                             CosmeticRepository cosmeticRepository,
                             IapPurchaseRepository iapPurchaseRepository,
                             TierPersonalBestRepository tierPersonalBestRepository,
                             LabRepository labRepository) {
        this.cardRepository = cardRepository;
        this.statBreakdownRepository = statBreakdownRepository;
        this.cosmeticRepository = cosmeticRepository;
        this.iapPurchaseRepository = iapPurchaseRepository;
        this.tierPersonalBestRepository = tierPersonalBestRepository;
        this.labRepository = labRepository;
    }

    public CoinBonusDto compute(int tier, int presetId, String modulePreset) {
        List<BonusFactorDto> factors = new ArrayList<>();
        double total = 1.0;

        for (IapPurchaseData p : iapPurchaseRepository.getAll()) {
            double mult = p.owned() ? p.multiplier() : 1.0;
            factors.add(new BonusFactorDto(p.displayName(), mult, p.owned()));
            total *= mult;
        }

        double cardsMult = activeCardsMultiplier(presetId);
        factors.add(new BonusFactorDto("Active Cards", cardsMult, cardsMult > 1.0));
        total *= cardsMult;

        double modulesMult = 1.0 + valueOrZero(
                statBreakdownRepository.getModuleSubstatValueForPreset(COINS_KILL_BONUS_STAT_KEY, modulePreset));
        factors.add(new BonusFactorDto("Modules", modulesMult, modulesMult > 1.0));
        total *= modulesMult;

        double tierMult = tierPersonalBestRepository.findCoinMultiplier(tier).orElse(1.0);
        factors.add(new BonusFactorDto("Difficulty Tier", tierMult, true));
        total *= tierMult;

        StatSummary coinBonusSummary = statBreakdownRepository.getSummary().get(COIN_BONUS_STAT_KEY);

        double themesMult = themesMultiplier();
        factors.add(new BonusFactorDto("Themes Bonus", themesMult, themesMult > 1.0));
        total *= themesMult;

        double relicsMult = 1.0 + valueOrZero(coinBonusSummary != null ? coinBonusSummary.relicBonus() : null);
        factors.add(new BonusFactorDto("Relics Bonus", relicsMult, relicsMult > 1.0));
        total *= relicsMult;

        double enhancementMult = coinBonusSummary != null && coinBonusSummary.workshopPlusValue() != null
                ? coinBonusSummary.workshopPlusValue() : 1.0;
        factors.add(new BonusFactorDto("Enhancement Bonus", enhancementMult, enhancementMult > 1.0));
        total *= enhancementMult;

        double dissonantMult = dissonantCoinBonus(tier);
        factors.add(new BonusFactorDto("Dissonant Coin Bonus", dissonantMult, dissonantMult > 1.0));
        total *= dissonantMult;

        return new CoinBonusDto(tier, factors, total);
    }

    private double activeCardsMultiplier(int presetId) {
        Optional<CardData> coinsCard = cardRepository.findByName(COINS_CARD_NAME);
        if (coinsCard.isEmpty()) return 1.0;

        boolean equipped = cardRepository.getAssignments(presetId).stream()
                .anyMatch(a -> COINS_CARD_NAME.equals(a.cardName()));
        if (!equipped) return 1.0;

        CardData c = coinsCard.get();
        List<Double> levelValues = List.of(
                c.level1(), c.level2(), c.level3(), c.level4(), c.level5(), c.level6(), c.level7());
        double levelValue = levelValues.get(c.starLevel() - 1);

        // Mastery: DB fields mastery_level_0..8 are player research levels 1..9; masteryLabLevel=0
        // (not yet researched) is a multiplicative no-op (1.0) — same convention as CardController.
        List<Double> masteryValues = List.of(
                1.0, c.masteryLevel0(), c.masteryLevel1(), c.masteryLevel2(), c.masteryLevel3(),
                c.masteryLevel4(), c.masteryLevel5(), c.masteryLevel6(), c.masteryLevel7(), c.masteryLevel8());
        double masteryValue = masteryValues.get(c.masteryLabLevel());

        return levelValue * masteryValue;
    }

    private double themesMultiplier() {
        double sum = cosmeticRepository.getAll().stream()
                .filter(CosmeticRepository.CosmeticItem::owned)
                .mapToDouble(CosmeticRepository.CosmeticItem::coinBonusPerItem)
                .sum();
        return 1.0 + sum;
    }

    private double dissonantCoinBonus(int tier) {
        List<TierPb> allTiers = tierPersonalBestRepository.findAll();
        List<Integer> allUtilityWaves = allTiers.stream().map(TierPb::utilityWaves).toList();
        int tierUtilityWaves = allTiers.stream()
                .filter(t -> t.tier() == tier)
                .map(TierPb::utilityWaves)
                .findFirst()
                .orElse(0);
        int echoLevel = getEchoLevel(UTILITY_ECHO_LAB);
        return DissonanceBoostUtility.computeRaw(tierUtilityWaves, allUtilityWaves, echoLevel, DissonanceType.UTILITY);
    }

    private int getEchoLevel(String labName) {
        return labRepository.getAll().stream()
                .filter(l -> labName.equals(l.name()))
                .mapToInt(LabRepository.LabData::currentLevel)
                .findFirst()
                .orElse(0);
    }

    private static double valueOrZero(Double value) {
        return value != null ? value : 0.0;
    }
}
