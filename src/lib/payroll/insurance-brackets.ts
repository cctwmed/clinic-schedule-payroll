/**
 * 勞健保投保級距（115 年 / 2026，一般事業單位）
 * 部分工時：健保最低級距 29,500 前適用；全職：29,500–45,800 共 11 級
 */
export type InsuranceGradeGroup = "part_time" | "full_time";

export type HealthInsuranceEnrollment = "clinic" | "dependent" | "none";

export interface InsuranceBracket {
  insuredSalary: number;
  group: InsuranceGradeGroup;
  laborInsuranceSelfPay: number;
  /** 診所投保時之健保個人自付（115 年最低級距 29,500 起） */
  healthInsuranceSelfPayClinic: number;
  laborInsuranceEmployerPay: number;
  healthInsuranceEmployerPayClinic: number;
  laborPensionEmployerPay: number;
}

export const MIN_FULL_TIME_INSURED_SALARY = 29_500;
export const INSURANCE_BRACKET_YEAR = 115;

function pension6(insuredSalary: number): number {
  return Math.round(insuredSalary * 0.06);
}

function bracket(
  insuredSalary: number,
  group: InsuranceGradeGroup,
  laborSelf: number,
  laborEmployer: number,
  healthSelfClinic: number,
  healthEmployerClinic: number
): InsuranceBracket {
  return {
    insuredSalary,
    group,
    laborInsuranceSelfPay: laborSelf,
    healthInsuranceSelfPayClinic: healthSelfClinic,
    laborInsuranceEmployerPay: laborEmployer,
    healthInsuranceEmployerPayClinic: healthEmployerClinic,
    laborPensionEmployerPay: pension6(insuredSalary),
  };
}

/** 部分工時級距（月薪低於基本工資 29,500） */
export const PART_TIME_INSURANCE_BRACKETS: InsuranceBracket[] = [
  bracket(11_100, "part_time", 277, 972, 0, 443),
  bracket(12_540, "part_time", 313, 1_097, 0, 443),
  bracket(13_500, "part_time", 338, 1_182, 0, 443),
  bracket(15_840, "part_time", 396, 1_386, 0, 443),
  bracket(16_500, "part_time", 413, 1_444, 0, 443),
  bracket(17_280, "part_time", 432, 1_512, 0, 443),
  bracket(17_880, "part_time", 447, 1_564, 0, 443),
  bracket(19_047, "part_time", 476, 1_666, 0, 443),
  bracket(20_008, "part_time", 500, 1_751, 0, 443),
  bracket(21_009, "part_time", 525, 1_838, 0, 443),
  bracket(22_000, "part_time", 550, 1_925, 0, 443),
  bracket(23_100, "part_time", 577, 2_022, 0, 443),
  bracket(24_000, "part_time", 600, 2_100, 0, 443),
  bracket(25_250, "part_time", 632, 2_210, 0, 443),
  bracket(26_400, "part_time", 660, 2_310, 0, 443),
  bracket(27_600, "part_time", 690, 2_415, 0, 443),
  bracket(28_590, "part_time", 715, 2_501, 0, 443),
];

/** 全職級距（29,500 起至 45,800，共 11 級） */
export const FULL_TIME_INSURANCE_BRACKETS: InsuranceBracket[] = [
  bracket(29_500, "full_time", 738, 2_582, 458, 1_428),
  bracket(30_300, "full_time", 758, 2_651, 470, 1_466),
  bracket(31_800, "full_time", 795, 2_783, 493, 1_539),
  bracket(33_300, "full_time", 833, 2_914, 516, 1_611),
  bracket(34_800, "full_time", 870, 3_045, 540, 1_684),
  bracket(36_300, "full_time", 908, 3_176, 563, 1_757),
  bracket(38_200, "full_time", 955, 3_342, 592, 1_849),
  bracket(40_100, "full_time", 1_002, 3_509, 622, 1_940),
  bracket(42_000, "full_time", 1_050, 3_675, 651, 2_032),
  bracket(43_900, "full_time", 1_098, 3_841, 681, 2_124),
  bracket(45_800, "full_time", 1_145, 4_008, 710, 2_216),
];

export const INSURANCE_BRACKETS: InsuranceBracket[] = [
  ...PART_TIME_INSURANCE_BRACKETS,
  ...FULL_TIME_INSURANCE_BRACKETS,
];

export function formatInsuredSalaryLabel(salary: number, group?: InsuranceGradeGroup): string {
  const prefix = group === "part_time" ? "部分工時 " : group === "full_time" ? "全職 " : "";
  return `${prefix}$${salary.toLocaleString("zh-TW")}`;
}

export function getInsuranceBracket(insuredSalary: number): InsuranceBracket | undefined {
  return INSURANCE_BRACKETS.find((b) => b.insuredSalary === insuredSalary);
}

export function applyInsuranceBracket(
  bracket: InsuranceBracket,
  enrollment: HealthInsuranceEnrollment = "clinic"
) {
  const healthSelf =
    enrollment === "clinic" ? bracket.healthInsuranceSelfPayClinic : 0;
  const healthEmployer =
    enrollment === "clinic" ? bracket.healthInsuranceEmployerPayClinic : 0;

  return {
    labor_insurance_self_pay: bracket.laborInsuranceSelfPay,
    health_insurance_self_pay: healthSelf,
    labor_insurance_employer_pay: bracket.laborInsuranceEmployerPay,
    health_insurance_employer_pay: healthEmployer,
    labor_pension_employer_pay: bracket.laborPensionEmployerPay,
  };
}

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
      Math.abs(b.healthInsuranceSelfPayClinic - form.health_insurance_self_pay) +
      Math.abs(b.laborInsuranceEmployerPay - form.labor_insurance_employer_pay);
    if (score < bestScore) {
      bestScore = score;
      best = b;
    }
  }

  return best && bestScore <= 50 ? best.insuredSalary : "";
}

export const HEALTH_ENROLLMENT_LABELS: Record<HealthInsuranceEnrollment, string> = {
  clinic: "由診所投保（本欄位帶入健保費）",
  dependent: "眷屬依附／不在此投保（健保費為 0，如工讀生掛父母名下）",
  none: "不投保健保（個人與雇主健保費皆 0）",
};
