export interface AnnualLeaveRecord {
  id: string;
  employee_id: string;
  period_start: string;
  period_end: string;
  expiry_date: string;
  total_days: number;
  used_days: number;
  payout_days: number | null;
  payout_amount: number | null;
  payout_payroll_run_id: string | null;
  settled_at: string | null;
  note: string | null;
}

export interface LeaveEntitlementPeriod {
  periodStart: string;
  periodEnd: string;
  expiryDate: string;
  totalDays: number;
  seniorityLabel: string;
}

export interface EmployeeLeaveSummary {
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  arrivalDate: string;
  period: LeaveEntitlementPeriod | null;
  record: AnnualLeaveRecord | null;
  remainingDays: number;
}
