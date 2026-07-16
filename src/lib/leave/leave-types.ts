/** 五大假別（對應 leave_records.leave_type） */
export type LeaveRecordType =
  | "special"
  | "marriage"
  | "bereavement"
  | "sick"
  | "personal";

export type LeaveRecordStatus = "pending" | "approved" | "rejected";

export interface LeaveTypeDefinition {
  code: LeaveRecordType;
  label: string;
  /** 支薪比例：1 全薪、0.5 半薪、0 不給薪 */
  payRatio: number;
  /** 畫面顯示用支薪說明（簡短） */
  payLabel: string;
  /** 年度上限（小時），null 表示依特休週期或無固定上限 */
  annualLimitHours: number | null;
  description: string;
}

/** 假設 1 日 = 8 小時換算法定天數上限 */
export const HOURS_PER_LEAVE_DAY = 8;

export const LEAVE_TYPE_DEFINITIONS: Record<LeaveRecordType, LeaveTypeDefinition> = {
  special: {
    code: "special",
    label: "特休假",
    payRatio: 1,
    payLabel: "支全薪",
    annualLimitHours: null,
    description: "依週年制特休天數控管",
  },
  marriage: {
    code: "marriage",
    label: "婚假",
    payRatio: 1,
    payLabel: "支全薪",
    annualLimitHours: 8 * HOURS_PER_LEAVE_DAY,
    description: "法定 8 天",
  },
  bereavement: {
    code: "bereavement",
    label: "喪假",
    payRatio: 1,
    payLabel: "支全薪",
    annualLimitHours: 8 * HOURS_PER_LEAVE_DAY,
    description: "依親等 3～8 天（由管理員確認時數）",
  },
  sick: {
    code: "sick",
    label: "普通傷病假",
    payRatio: 0.5,
    payLabel: "支半薪",
    annualLimitHours: 30 * HOURS_PER_LEAVE_DAY,
    description: "一年內未住院 30 天",
  },
  personal: {
    code: "personal",
    label: "事假",
    payRatio: 0,
    payLabel: "不給薪",
    annualLimitHours: 14 * HOURS_PER_LEAVE_DAY,
    description: "一年內 14 天",
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
  return LEAVE_TYPE_DEFINITIONS[type].payRatio > 0;
}

export function isDeductibleLeaveType(type: LeaveRecordType): boolean {
  return type === "sick" || type === "personal";
}
