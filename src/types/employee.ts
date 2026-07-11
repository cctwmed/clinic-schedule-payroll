export type EmployeeRole = "nurse" | "admin" | "doctor" | "staff";
export type EmployeeStatus = "active" | "inactive" | "resigned";
export type EmploymentType = "full_time" | "part_time" | "contract";

export type JobTitle =
  | "nurse_lead"
  | "nurse_fulltime"
  | "doctor"
  | "pharmacist"
  | "admin_staff"
  | "cleaner"
  | "other";

export interface Employee {
  id: string;
  clinic_id: string;
  employee_no: string;
  name: string;
  role: EmployeeRole;
  job_title: JobTitle | string | null;
  employment_type: EmploymentType;
  status: EmployeeStatus;
  email: string | null;
  phone: string | null;
  hire_date: string;
  hourly_wage: number;
  labor_insurance_self_pay: number;
  health_insurance_self_pay: number;
  weekly_rest_day: number;
  daily_work_hours: number;
  created_at: string;
  updated_at: string;
}

export interface EmployeeFormData {
  employee_no: string;
  name: string;
  role: EmployeeRole;
  job_title: JobTitle;
  employment_type: EmploymentType;
  status: EmployeeStatus;
  email: string;
  phone: string;
  hire_date: string;
  hourly_wage: number;
  labor_insurance_self_pay: number;
  health_insurance_self_pay: number;
}

export const JOB_TITLE_LABELS: Record<JobTitle, string> = {
  nurse_lead: "護理組長",
  nurse_fulltime: "正職護理師",
  doctor: "醫師",
  pharmacist: "藥師",
  admin_staff: "行政",
  cleaner: "打掃",
  other: "其他",
};

export function displayJobTitle(jobTitle: JobTitle | string | null | undefined, role: EmployeeRole): string {
  if (jobTitle && jobTitle in JOB_TITLE_LABELS) {
    return JOB_TITLE_LABELS[jobTitle as JobTitle];
  }
  if (jobTitle && typeof jobTitle === "string" && jobTitle.trim()) {
    return jobTitle.trim();
  }
  return ROLE_LABELS[role];
}

export const ROLE_LABELS: Record<EmployeeRole, string> = {
  nurse: "護理師",
  admin: "管理員",
  doctor: "醫師",
  staff: "行政人員",
};

export const STATUS_LABELS: Record<EmployeeStatus, string> = {
  active: "在職",
  inactive: "停職",
  resigned: "離職",
};

export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  full_time: "全職",
  part_time: "兼職",
  contract: "約聘",
};

export const EMPTY_EMPLOYEE_FORM: EmployeeFormData = {
  employee_no: "",
  name: "",
  role: "nurse",
  job_title: "nurse_fulltime",
  employment_type: "full_time",
  status: "active",
  email: "",
  phone: "",
  hire_date: new Date().toISOString().slice(0, 10),
  hourly_wage: 0,
  labor_insurance_self_pay: 0,
  health_insurance_self_pay: 0,
};

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
