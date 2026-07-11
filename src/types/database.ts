// 執行 `npm run db:types` 後由 Supabase CLI 自動生成
// 目前為佔位型別，供開發初期使用

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ShiftCategory = "morning" | "afternoon" | "evening" | "closed" | "custom";
export type ComplianceSeverity = "info" | "warning" | "violation";

export interface Employee {
  id: string;
  clinic_id: string;
  employee_no: string;
  name: string;
  hourly_wage: number;
  labor_insurance_self_pay: number;
  health_insurance_self_pay: number;
}

export interface ShiftAssignment {
  id: string;
  employee_id: string;
  shift_type_id: string;
  work_date: string;
  expected_clock_in: string;
  expected_clock_out: string;
}

export interface ClockRecord {
  id: string;
  employee_id: string;
  clock_type: "clock_in" | "clock_out" | "break_start" | "break_end";
  clocked_at: string;
  latitude: number | null;
  longitude: number | null;
}

export interface ComplianceAlert {
  id: string;
  employee_id: string | null;
  alert_date: string;
  rule_code: string;
  message: string;
  severity: ComplianceSeverity;
  actual_value: number | null;
  threshold_value: number | null;
  unit: string | null;
}
