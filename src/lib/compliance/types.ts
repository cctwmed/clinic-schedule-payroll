export type ComplianceSeverity = "info" | "warning" | "violation";

export interface ComplianceIssue {
  ruleCode: string;
  severity: ComplianceSeverity;
  message: string;
  employeeId?: string;
  employeeName?: string;
  date?: string;
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
  clockedAt: string;
}

export interface DayOffRecord {
  date: string;
  employeeId: string;
  type: "statutory" | "rest";
}
