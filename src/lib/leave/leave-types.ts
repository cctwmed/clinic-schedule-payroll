/** 五大假別＋產假／安胎假（對應 leave_records.leave_type） */
export type LeaveRecordType =
  | "special"
  | "marriage"
  | "bereavement"
  | "sick"
  | "personal"
  | "maternity"
  | "pregnancy_rest"
  | "menstrual";

export type LeaveRecordStatus = "pending" | "approved" | "rejected";

export interface LeaveTypeDefinition {
  code: LeaveRecordType;
  label: string;
  /** 支薪比例：1 全薪、0.5 半薪、0 不給薪；產假實際比例依年資動態計算 */
  payRatio: number;
  /** 畫面顯示用支薪說明（簡短） */
  payLabel: string;
  /** 年度上限（小時），null 表示依特休週期或無固定上限／醫師證明 */
  annualLimitHours: number | null;
  description: string;
  /** 請假期間是否維持在職（勞健保／勞退持續） */
  keepActiveStatus: boolean;
}

/** 假設 1 日 = 8 小時換算法定天數上限 */
export const HOURS_PER_LEAVE_DAY = 8;

/** 產假法定日數（8 週） */
export const MATERNITY_LEAVE_DAYS = 56;

/** 產假全薪所需最低年資（月） */
export const MATERNITY_FULL_PAY_SERVICE_MONTHS = 6;

export const LEAVE_TYPE_DEFINITIONS: Record<LeaveRecordType, LeaveTypeDefinition> = {
  special: {
    code: "special",
    label: "特休假",
    payRatio: 1,
    payLabel: "支全薪",
    annualLimitHours: null,
    description: "依週年制特休天數控管",
    keepActiveStatus: true,
  },
  marriage: {
    code: "marriage",
    label: "婚假",
    payRatio: 1,
    payLabel: "支全薪",
    annualLimitHours: 8 * HOURS_PER_LEAVE_DAY,
    description: "法定 8 天",
    keepActiveStatus: true,
  },
  bereavement: {
    code: "bereavement",
    label: "喪假",
    payRatio: 1,
    payLabel: "支全薪",
    annualLimitHours: 8 * HOURS_PER_LEAVE_DAY,
    description: "依親等 3～8 天（由管理員確認時數）",
    keepActiveStatus: true,
  },
  sick: {
    code: "sick",
    label: "普通傷病假",
    payRatio: 0.5,
    payLabel: "支半薪",
    annualLimitHours: 30 * HOURS_PER_LEAVE_DAY,
    description: "一年內未住院 30 天",
    keepActiveStatus: true,
  },
  personal: {
    code: "personal",
    label: "事假",
    payRatio: 0,
    payLabel: "不給薪",
    annualLimitHours: 14 * HOURS_PER_LEAVE_DAY,
    description: "一年內 14 天",
    keepActiveStatus: true,
  },
  maternity: {
    code: "maternity",
    label: "產假",
    payRatio: 1,
    payLabel: "年資滿 6 個月全薪／未滿半薪",
    annualLimitHours: MATERNITY_LEAVE_DAYS * HOURS_PER_LEAVE_DAY,
    description:
      "法定 8 週（56 天）。狀態維持在職；勞健保／勞退持續提繳。年資滿 6 個月支全薪，未滿支半薪。",
    keepActiveStatus: true,
  },
  pregnancy_rest: {
    code: "pregnancy_rest",
    label: "安胎假",
    payRatio: 0,
    payLabel: "不給薪",
    annualLimitHours: null,
    description:
      "安胎休養（依醫師證明）。狀態維持在職；勞健保／勞退持續提繳；薪資不給（扣全額時薪×時數）。",
    keepActiveStatus: true,
  },
  menstrual: {
    code: "menstrual",
    label: "生理假",
    payRatio: 1,
    payLabel: "支全薪（不扣全勤）",
    annualLimitHours: null,
    description: "生理假為法定假別；不觸發全勤獎金扣除。",
    keepActiveStatus: true,
  },
};

export const LEAVE_TYPE_OPTIONS = Object.values(LEAVE_TYPE_DEFINITIONS);

export function leaveTypeLabel(type: LeaveRecordType): string {
  return LEAVE_TYPE_DEFINITIONS[type]?.label ?? type;
}

export function leavePayLabel(type: LeaveRecordType): string {
  return LEAVE_TYPE_DEFINITIONS[type]?.payLabel ?? "";
}

export function isPaidLeaveType(type: LeaveRecordType): boolean {
  return LEAVE_TYPE_DEFINITIONS[type].payRatio > 0 || type === "maternity";
}

/** 會從應領薪資扣款的假別（事假全扣、病假半扣、產假未滿半年半扣、安胎全扣） */
export function isDeductibleLeaveType(type: LeaveRecordType): boolean {
  return type === "sick" || type === "personal" || type === "maternity" || type === "pregnancy_rest";
}

/** 計算到職至基準日的完整月數 */
export function serviceMonthsAt(hireDate: string, asOfDate: string): number {
  if (!hireDate || !asOfDate) return 0;
  const hire = new Date(`${hireDate}T12:00:00+08:00`);
  const asOf = new Date(`${asOfDate}T12:00:00+08:00`);
  if (Number.isNaN(hire.getTime()) || Number.isNaN(asOf.getTime()) || asOf < hire) {
    return 0;
  }
  let months =
    (asOf.getFullYear() - hire.getFullYear()) * 12 + (asOf.getMonth() - hire.getMonth());
  if (asOf.getDate() < hire.getDate()) months -= 1;
  return Math.max(0, months);
}

/**
 * 產假支薪比例（勞基法第 50 條）：
 * 受僱滿 6 個月 → 全薪；未滿 6 個月 → 半薪
 */
export function maternityPayRatio(hireDate: string, asOfDate: string): 1 | 0.5 {
  return serviceMonthsAt(hireDate, asOfDate) >= MATERNITY_FULL_PAY_SERVICE_MONTHS ? 1 : 0.5;
}

export function maternityPayLabel(hireDate: string, asOfDate: string): string {
  return maternityPayRatio(hireDate, asOfDate) === 1
    ? "產假全薪（年資滿 6 個月）"
    : "產假半薪（年資未滿 6 個月）";
}
