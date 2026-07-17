/**
 * 勞健保投保級距與保費對照（115 年 1/1 起，一般事業單位、無眷屬依附）
 * 資料來源：勞動部／健保署三合一對照表，僅供系統帶入參考，請以官方公告為準。
 */
export interface InsuranceBracket {
  insuredSalary: number;
  laborInsuranceSelfPay: number;
  healthInsuranceSelfPay: number;
  laborInsuranceEmployerPay: number;
  healthInsuranceEmployerPay: number;
  laborPensionEmployerPay: number;
}

/** 勞退雇主提繳 6% */
function pension6(insuredSalary: number): number {
  return Math.round(insuredSalary * 0.06);
}

/** 115 年級距表（含 114 年仍適用之級距） */
export const INSURANCE_BRACKETS: InsuranceBracket[] = [
  { insuredSalary: 11_100, laborInsuranceSelfPay: 277, healthInsuranceSelfPay: 0, laborInsuranceEmployerPay: 972, healthInsuranceEmployerPay: 443, laborPensionEmployerPay: pension6(11_100) },
  { insuredSalary: 12_540, laborInsuranceSelfPay: 313, healthInsuranceSelfPay: 0, laborInsuranceEmployerPay: 1_097, healthInsuranceEmployerPay: 443, laborPensionEmployerPay: pension6(12_540) },
  { insuredSalary: 13_500, laborInsuranceSelfPay: 338, healthInsuranceSelfPay: 0, laborInsuranceEmployerPay: 1_182, healthInsuranceEmployerPay: 443, laborPensionEmployerPay: pension6(13_500) },
  { insuredSalary: 15_840, laborInsuranceSelfPay: 396, healthInsuranceSelfPay: 0, laborInsuranceEmployerPay: 1_386, healthInsuranceEmployerPay: 443, laborPensionEmployerPay: pension6(15_840) },
  { insuredSalary: 16_500, laborInsuranceSelfPay: 413, healthInsuranceSelfPay: 0, laborInsuranceEmployerPay: 1_444, healthInsuranceEmployerPay: 443, laborPensionEmployerPay: pension6(16_500) },
  { insuredSalary: 17_280, laborInsuranceSelfPay: 432, healthInsuranceSelfPay: 0, laborInsuranceEmployerPay: 1_512, healthInsuranceEmployerPay: 443, laborPensionEmployerPay: pension6(17_280) },
  { insuredSalary: 17_880, laborInsuranceSelfPay: 447, healthInsuranceSelfPay: 0, laborInsuranceEmployerPay: 1_564, healthInsuranceEmployerPay: 443, laborPensionEmployerPay: pension6(17_880) },
  { insuredSalary: 19_047, laborInsuranceSelfPay: 476, healthInsuranceSelfPay: 0, laborInsuranceEmployerPay: 1_666, healthInsuranceEmployerPay: 443, laborPensionEmployerPay: pension6(19_047) },
  { insuredSalary: 20_008, laborInsuranceSelfPay: 500, healthInsuranceSelfPay: 0, laborInsuranceEmployerPay: 1_751, healthInsuranceEmployerPay: 443, laborPensionEmployerPay: pension6(20_008) },
  { insuredSalary: 21_009, laborInsuranceSelfPay: 525, healthInsuranceSelfPay: 0, laborInsuranceEmployerPay: 1_838, healthInsuranceEmployerPay: 443, laborPensionEmployerPay: pension6(21_009) },
  { insuredSalary: 22_000, laborInsuranceSelfPay: 550, healthInsuranceSelfPay: 0, laborInsuranceEmployerPay: 1_925, healthInsuranceEmployerPay: 443, laborPensionEmployerPay: pension6(22_000) },
  { insuredSalary: 23_100, laborInsuranceSelfPay: 577, healthInsuranceSelfPay: 0, laborInsuranceEmployerPay: 2_022, healthInsuranceEmployerPay: 443, laborPensionEmployerPay: pension6(23_100) },
  { insuredSalary: 24_000, laborInsuranceSelfPay: 600, healthInsuranceSelfPay: 0, laborInsuranceEmployerPay: 2_100, healthInsuranceEmployerPay: 443, laborPensionEmployerPay: pension6(24_000) },
  { insuredSalary: 25_250, laborInsuranceSelfPay: 632, healthInsuranceSelfPay: 0, laborInsuranceEmployerPay: 2_210, healthInsuranceEmployerPay: 443, laborPensionEmployerPay: pension6(25_250) },
  { insuredSalary: 26_400, laborInsuranceSelfPay: 660, healthInsuranceSelfPay: 0, laborInsuranceEmployerPay: 2_310, healthInsuranceEmployerPay: 443, laborPensionEmployerPay: pension6(26_400) },
  { insuredSalary: 27_600, laborInsuranceSelfPay: 690, healthInsuranceSelfPay: 0, laborInsuranceEmployerPay: 2_415, healthInsuranceEmployerPay: 443, laborPensionEmployerPay: pension6(27_600) },
  { insuredSalary: 28_590, laborInsuranceSelfPay: 715, healthInsuranceSelfPay: 0, laborInsuranceEmployerPay: 2_501, healthInsuranceEmployerPay: 443, laborPensionEmployerPay: pension6(28_590) },
  { insuredSalary: 29_500, laborInsuranceSelfPay: 738, healthInsuranceSelfPay: 458, laborInsuranceEmployerPay: 2_582, healthInsuranceEmployerPay: 1_428, laborPensionEmployerPay: pension6(29_500) },
  { insuredSalary: 28_800, laborInsuranceSelfPay: 720, healthInsuranceSelfPay: 0, laborInsuranceEmployerPay: 2_520, healthInsuranceEmployerPay: 447, laborPensionEmployerPay: pension6(28_800) },
  { insuredSalary: 30_300, laborInsuranceSelfPay: 758, healthInsuranceSelfPay: 470, laborInsuranceEmployerPay: 2_651, healthInsuranceEmployerPay: 1_466, laborPensionEmployerPay: pension6(30_300) },
  { insuredSalary: 31_800, laborInsuranceSelfPay: 795, healthInsuranceSelfPay: 493, laborInsuranceEmployerPay: 2_783, healthInsuranceEmployerPay: 1_539, laborPensionEmployerPay: pension6(31_800) },
  { insuredSalary: 33_300, laborInsuranceSelfPay: 833, healthInsuranceSelfPay: 516, laborInsuranceEmployerPay: 2_914, healthInsuranceEmployerPay: 1_611, laborPensionEmployerPay: pension6(33_300) },
  { insuredSalary: 34_800, laborInsuranceSelfPay: 870, healthInsuranceSelfPay: 540, laborInsuranceEmployerPay: 3_045, healthInsuranceEmployerPay: 1_684, laborPensionEmployerPay: pension6(34_800) },
  { insuredSalary: 36_300, laborInsuranceSelfPay: 908, healthInsuranceSelfPay: 563, laborInsuranceEmployerPay: 3_176, healthInsuranceEmployerPay: 1_757, laborPensionEmployerPay: pension6(36_300) },
  { insuredSalary: 38_200, laborInsuranceSelfPay: 955, healthInsuranceSelfPay: 592, laborInsuranceEmployerPay: 3_342, healthInsuranceEmployerPay: 1_849, laborPensionEmployerPay: pension6(38_200) },
  { insuredSalary: 40_100, laborInsuranceSelfPay: 1_002, healthInsuranceSelfPay: 622, laborInsuranceEmployerPay: 3_509, healthInsuranceEmployerPay: 1_940, laborPensionEmployerPay: pension6(40_100) },
  { insuredSalary: 42_000, laborInsuranceSelfPay: 1_050, healthInsuranceSelfPay: 651, laborInsuranceEmployerPay: 3_675, healthInsuranceEmployerPay: 2_032, laborPensionEmployerPay: pension6(42_000) },
  { insuredSalary: 43_900, laborInsuranceSelfPay: 1_098, healthInsuranceSelfPay: 681, laborInsuranceEmployerPay: 3_841, healthInsuranceEmployerPay: 2_124, laborPensionEmployerPay: pension6(43_900) },
  { insuredSalary: 45_800, laborInsuranceSelfPay: 1_145, healthInsuranceSelfPay: 710, laborInsuranceEmployerPay: 4_008, healthInsuranceEmployerPay: 2_216, laborPensionEmployerPay: pension6(45_800) },
  { insuredSalary: 48_200, laborInsuranceSelfPay: 1_145, healthInsuranceSelfPay: 748, laborInsuranceEmployerPay: 4_008, healthInsuranceEmployerPay: 2_332, laborPensionEmployerPay: pension6(48_200) },
  { insuredSalary: 50_600, laborInsuranceSelfPay: 1_145, healthInsuranceSelfPay: 785, laborInsuranceEmployerPay: 4_008, healthInsuranceEmployerPay: 2_449, laborPensionEmployerPay: pension6(50_600) },
  { insuredSalary: 53_000, laborInsuranceSelfPay: 1_145, healthInsuranceSelfPay: 822, laborInsuranceEmployerPay: 4_008, healthInsuranceEmployerPay: 2_565, laborPensionEmployerPay: pension6(53_000) },
  { insuredSalary: 57_800, laborInsuranceSelfPay: 1_145, healthInsuranceSelfPay: 896, laborInsuranceEmployerPay: 4_008, healthInsuranceEmployerPay: 2_797, laborPensionEmployerPay: pension6(57_800) },
  { insuredSalary: 60_800, laborInsuranceSelfPay: 1_145, healthInsuranceSelfPay: 943, laborInsuranceEmployerPay: 4_008, healthInsuranceEmployerPay: 2_942, laborPensionEmployerPay: pension6(60_800) },
  { insuredSalary: 72_800, laborInsuranceSelfPay: 1_145, healthInsuranceSelfPay: 1_129, laborInsuranceEmployerPay: 4_008, healthInsuranceEmployerPay: 3_523, laborPensionEmployerPay: pension6(72_800) },
].sort((a, b) => a.insuredSalary - b.insuredSalary);

export const INSURANCE_BRACKET_YEAR = 115;

export function formatInsuredSalaryLabel(salary: number): string {
  return `$${salary.toLocaleString("zh-TW")}`;
}

export function getInsuranceBracket(insuredSalary: number): InsuranceBracket | undefined {
  return INSURANCE_BRACKETS.find((b) => b.insuredSalary === insuredSalary);
}

/** 依現有保費反查最接近的級距（編輯員工時帶入下拉） */
export function guessInsuranceBracket(form: {
  labor_insurance_self_pay: number;
  health_insurance_self_pay: number;
  labor_insurance_employer_pay: number;
}): number | "" {
  if (!form.labor_insurance_self_pay && !form.labor_insurance_employer_pay) return "";

  let best: InsuranceBracket | null = null;
  let bestScore = Infinity;

  for (const b of INSURANCE_BRACKETS) {
    const score =
      Math.abs(b.laborInsuranceSelfPay - form.labor_insurance_self_pay) +
      Math.abs(b.healthInsuranceSelfPay - form.health_insurance_self_pay) +
      Math.abs(b.laborInsuranceEmployerPay - form.labor_insurance_employer_pay);
    if (score < bestScore) {
      bestScore = score;
      best = b;
    }
  }

  return best && bestScore <= 50 ? best.insuredSalary : "";
}

export function applyInsuranceBracket(bracket: InsuranceBracket) {
  return {
    labor_insurance_self_pay: bracket.laborInsuranceSelfPay,
    health_insurance_self_pay: bracket.healthInsuranceSelfPay,
    labor_insurance_employer_pay: bracket.laborInsuranceEmployerPay,
    health_insurance_employer_pay: bracket.healthInsuranceEmployerPay,
    labor_pension_employer_pay: bracket.laborPensionEmployerPay,
  };
}
