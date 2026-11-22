/**
 * Israeli figures the app relies on, in one dated place. Update every January.
 * Sources: Israel Tax Authority, Capital Market Authority, Bank of Israel (research notes, Nov 2026).
 */
export const IL = {
  year: 2026,
  /** Monthly salary ceiling for tax-exempt study fund deposits (salaried). 2026, frozen. https://www.mygemel.net/blog/?p=3453 */
  studyFundSalaryCeiling: 15_712,
  /** A study fund is free to withdraw, tax-free, six years after the first deposit (three at retirement age). Income Tax Ordinance §3(e1). https://www.kolzchut.org.il/he/קרן_השתלמות */
  studyFundLiquidYears: 6,
  /** Value of one tax credit point, per month. 2026, frozen (₪2,904/year). https://www.kolzchut.org.il/he/נקודות_זיכוי_ממס_הכנסה */
  creditPointMonthly: 242,
  /** Tax on real capital gains for an individual (Ordinance §91); 30% for a substantial shareholder. */
  capitalGainsTax: 0.25,
  /** Legal caps on pension fees, % from deposits / % of balance. */
  pensionFeeCap: { deposit: 6, balance: 0.5 },
  /** Years back a tax refund can be claimed (form 135). */
  taxRefundYears: 6,
  bankOfIsraelRate: 3.25,
  /** Prime = Bank of Israel rate + 1.5. */
  primeRate: 4.75,
  /** Typical prime-track mortgage rate (prime − 0.5), Nov 2026. A reference for comparison, not an offer. */
  typicalMortgageRate: 4.25,
  /**
   * Monthly income-tax brackets [upTo, rate] for 2026: indexation stays frozen, but the 2026 budget
   * widened the 20% bracket to ₪19,000 and the 31% bracket to ₪25,100. Top 50% includes the 3% surtax.
   * Sources (checked Nov 2026): simplecalc.co.il/guides/tax-brackets, mechushav.co.il/guide-madregot-mas.html.
   */
  taxBracketsMonthly: [[7_010, 0.1], [10_060, 0.14], [19_000, 0.2], [25_100, 0.31], [46_690, 0.35], [60_130, 0.47], [Infinity, 0.5]],
  /** Credit points for a resident: 2.25 (man), 2.75 (woman). Income Tax Ordinance §34, §36. */
  creditPoints: { man: 2.25, woman: 2.75 },
  /**
   * Extra credit points, 2026. Children [birth year, turning 1–2, 3, 4–5, 6–17, 18] per child, mother vs father:
   * https://www.kolzchut.org.il/he/נקודות_זיכוי_ממס_הכנסה_להורה_לילד_עד_גיל_5 and .../נקודות_זיכוי_ממס_הכנסה_להורים_לילדים_בגיל_12-6
   * Degree (one year after finishing): BA 1, MA 0.5. Discharge (36 months): full service 2, short 1.
   * Single parent +1. New immigrant by year since aliyah (8.5 points over 54 months): 1, 3, 2.5, 1.5, 0.5.
   * Degree, discharge and immigrant figures: kolzchut.org.il and protocol.co.il/income-tax-credit-points (secondary, Nov 2026).
   */
  creditPointRules: {
    childWoman: [2.5, 4.5, 3.5, 2.5, 2, 0.5],
    childMan: [2.5, 4.5, 3.5, 2.5, 1, 0],
    degree: { ba: 1, ma: 0.5 },
    service: { full: 2, short: 1 },
    aliyahByYear: [1, 3, 2.5, 1.5, 0.5],
    singleParent: 1,
  },
  /** Donations (§46): 35% credit above ₪207/year, up to 30% of taxable income. 2026. https://www.kolzchut.org.il/he/זיכוי_ממס_הכנסה_בשל_תרומה_(סעיף_46) */
  donationCredit: { rate: 0.35, min: 207, maxShareOfIncome: 0.3 },
  /** Private life-insurance premiums (§45א): 25% credit. Premium caps not modelled. */
  lifeInsuranceCreditRate: 0.25,
  /**
   * Self-employed, 2026 (https://www.mygemel.net/blog/?p=3453, secondary; frozen since 2025):
   * pension 16.5% of qualifying income up to ₪232,800/yr (first 5.5% → 35% credit, next 11% → deduction);
   * study fund deduction 4.5% of income up to ₪293,397/yr; deposits up to ₪20,566/yr keep gains tax-free.
   */
  selfEmployedDeposits: { pensionIncomeCap: 232_800, pensionCreditPct: 0.055, pensionDeductPct: 0.11, studyIncomeCap: 293_397, studyDeductPct: 0.045, studyGainsFreeCap: 20_566 },
  /** Credit for employee pension deposits: 35% of up to 7% of salary, salary capped (ITA, 2025 figure). */
  pensionCredit: { rate: 0.35, ofSalary: 0.07, salaryCeiling: 9_700 },
  /**
   * Bituach Leumi + health tax, 2026. Rates unchanged from 2025. From 2026 the reduced-rate band is
   * indexed to the CPI from ₪7,522 (not 60% of the average wage): ₪7,703. Ceiling ₪51,910.
   * Source: btl.gov.il circulars for 2026 (בל/651, "מקדמות ודמי ביטוח לעצמאים 2026").
   */
  bituach: {
    reducedUpTo: 7_703,
    ceiling: 51_910,
    /** [reduced, full] — national insurance + health tax combined. */
    employee: [0.0104 + 0.0323, 0.07 + 0.0517],
    selfEmployed: [0.0287 + 0.0323, 0.1283 + 0.0517],
  },
  /** Mandatory pension for the self-employed (Pension Law §6B, 2017): 4.45% up to half the avg wage, 12.55% up to the full avg wage. Avg wage 2026: ₪13,769 (btl.gov.il). */
  selfEmployedPension: { averageWage: 13_769, lowRate: 0.0445, highRate: 0.1255 },
  /** VAT 18% since 1 Jan 2025 (was 17%). Bimonthly report due by the 15th of the following month. */
  vat: { rate: 0.18, dueDay: 15 },
  /**
   * Purchase tax (מס רכישה) for a single home, [upTo, marginal rate]. Brackets frozen 16.01.2024–15.01.2028
   * (not indexed). Checked Nov 2026 against secondary sources, not the ITA page itself:
   * bizportal.co.il/realestates/news/article/20038028, bscpa.co.il (מס רכישה 2026). Editable in the calculator.
   */
  purchaseTaxSingleHome: [[1_978_745, 0], [2_347_040, 0.035], [6_055_070, 0.05], [20_183_565, 0.08], [Infinity, 0.1]],
  /**
   * Amendment 190 (תיקון 190): from age 60, with a "qualifying pension" (קצבה מזכה) above the minimum,
   * a provident fund for investment can pay a tax-free annuity; a lump sum pays 15% on the real gain.
   * Minimum ₪5,306/month for 2026 per pensuni.com/?p=2795 and gilisaar.co.il (citing the Jan 2026 ITA table);
   * not checked against the ITA directly. National Insurance old-age pension does not count.
   */
  amendment190: { minAge: 60, minQualifyingPension: 5_306, lumpRealGainTax: 0.15 },
  /**
   * Bank fee tracks every bank must offer, ₪/month, 2026. Basic: up to 10 direct actions + 1 teller action, price capped at ₪10
   * by the Bank of Israel. Extended: up to 50 direct + 10 teller, not capped; ₪20–30 at the big banks, 25 is a midpoint.
   * From 1 Jul 2027 both are replaced by one "account management" fee (BoI circular 2851, up to ₪10 for 100 actions).
   * Sources (checked Nov 2026): supermarker.themarker.com/Account/BankFeesReform2027.aspx (BoI data Q4 2025), boi.org.il.
   */
  bankFeeTracks: { basic: { price: 10, direct: 10, teller: 1 }, extended: { price: 25, direct: 50, teller: 10 } },
  /** Legal retirement age (men; women rise gradually from 62 to 65). Old-age Bituach Leumi and most pension annuities start here. */
  pensionAge: 67,
  /**
   * Tax-exempt severance per year of service (Income Tax Ordinance §9(7a)); exempt = min(this × years, 1.5 × last salary × years).
   * ₪13,750 for 2026 (indexation frozen), per bizportal.co.il and moreinvest.co.il "תקרות וסכומים 2026"; not checked against the ITA directly.
   */
  severanceExemptPerYear: 13_750,
} as const;