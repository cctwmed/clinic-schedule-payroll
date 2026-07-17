import type { HealthInsuranceEnrollment } from "@/lib/payroll/insurance-brackets";

export type EmployeeRole = "nurse" | "admin" | "doctor" | "staff";
export type EmployeeStatus = "active" | "inactive" | "resigned";
export type EmploymentType = "full_time" | "part_time" | "contract";

export type JobTitle =
  | "nurse_fulltime"
  | "doctor"
  | "pharmacist"
  | "admin_staff"
  | "cleaner"
  | "family_assistant"
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
  arrival_date?: string | null;
  birth_date?: string | null;
  national_id?: string | null;
  health_insurance_enrollment?: HealthInsuranceEnrollment | string | null;
  is_related_to_owner?: boolean;
  is_child_laborer?: boolean;
  hourly_wage: number;
  labor_insurance_self_pay: number;
  health_insurance_self_pay: number;
  labor_insurance_employer_pay: number;
  health_insurance_employer_pay: number;
  labor_pension_employer_pay: number;
  is_clinic_admin?: boolean;
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
  birth_date: string;
  national_id: string;
  health_insurance_enrollment: HealthInsuranceEnrollment;
  is_related_to_owner: boolean;
  hourly_wage: number;
  labor_insurance_self_pay: number;
  health_insurance_self_pay: number;
  labor_insurance_employer_pay: number;
  health_insurance_employer_pay: number;
  labor_pension_employer_pay: number;
  is_clinic_admin: boolean;
}

export const JOB_TITLE_LABELS: Record<JobTitle, string> = {
  nurse_fulltime: "護理師",
  doctor: "醫師",
  pharmacist: "藥師",
  admin_staff: "行政",
  cleaner: "打掃",
  family_assistant: "家屬/協助人員",
  other: "其他",
};

const LEGACY_JOB_TITLE_LABELS: Record<string, string> = {
  nurse_lead: "護理師",
};

export function displayJobTitle(jobTitle: JobTitle | string | null | undefined, role: EmployeeRole): string {
  if (jobTitle && jobTitle in JOB_TITLE_LABELS) {
    return JOB_TITLE_LABELS[jobTitle as JobTitle];
  }
  if (jobTitle && jobTitle in LEGACY_JOB_TITLE_LABELS) {
    return LEGACY_JOB_TITLE_LABELS[jobTitle];
  }
  if (jobTitle && typeof jobTitle === "string" && jobTitle.trim()) {
    return jobTitle.trim();
  }
  return ROLE_LABELS[role];
}

export function showRelatedOwnerInsuranceTip(form: {
  job_title: JobTitle | string;
  is_related_to_owner: boolean;
}): boolean {
  return form.job_title === "family_assistant" || form.is_related_to_owner;
}

export const ROLE_LABELS: Record<EmployeeRole, string> = {
  nurse: "護理師",
  admin: "管理員",
  doctor: "醫師",
  staff: "行政人員",
};

export const STATUS_LABELS: Record<EmployeeStatus, string> = {
  active: "在職",
  inactive: "停職（育嬰／懷孕）",
  resigned: "離職",
};

/** 狀態說明（表單提示用） */
export const STATUS_HINTS: Record<EmployeeStatus, string> = {
  active: "參與排班、打卡與算薪",
  inactive: "保留資料，暫不排班／不算薪（育嬰、懷孕等）",
  resigned: "保留歷史紀錄，不列入日常排班與算薪",
};

export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  full_time: "全職",
  part_time: "兼職/工讀",
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
  birth_date: "",
  national_id: "",
  health_insurance_enrollment: "clinic",
  is_related_to_owner: false,
  hourly_wage: 0,
  labor_insurance_self_pay: 0,
  health_insurance_self_pay: 0,
  labor_insurance_employer_pay: 0,
  health_insurance_employer_pay: 0,
  labor_pension_employer_pay: 0,
  is_clinic_admin: false,
};

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
