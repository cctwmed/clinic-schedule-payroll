export type ComplianceSeverity = "info" | "warning" | "violation";

export interface ComplianceIssue {
  ruleCode: string;
  severity: ComplianceSeverity;
  message: string;
  employeeId?: string;
  employeeName?: string;
  /** 事件日，或固定週期視窗起日 */
  date?: string;
  /** 固定 2／4 週週期視窗迄日（與 date 組成完整結算區間） */
  windowEnd?: string;
  actualValue?: number;
  thresholdValue?: number;
  unit?: string;
}

export interface WorkShiftBlock {
  date: string;
  employeeId: string;
  employeeName?: string;
  shiftCode: string;
  shiftName?: string;
  plannedHours: number;
  clockIn: string | null;
  clockOut: string | null;
  expectedStart: string;
  expectedEnd: string;
}

export interface ClockEvent {
  employeeId: string;
  clockType: "clock_in" | "clock_out" | "break_start" | "break_end";
  /** 實際打卡時間 */
  clockedAt: string;
  /** 薪資工時起算（上班卡）；未設則同 clockedAt */
  payableClockedAt?: string | null;
  /** 院長核可提早工時後，起算改回實際打卡 */
  earlyWorkApproved?: boolean;
}

export interface DayOffRecord {
  date: string;
  employeeId: string;
  type: "statutory" | "rest" | "annual_leave";
}
