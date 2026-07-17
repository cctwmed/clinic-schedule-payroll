"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createEmployee, updateEmployee } from "@/app/(dashboard)/employees/actions";
import type { Employee, EmployeeFormData } from "@/types/employee";
import {
  EMPTY_EMPLOYEE_FORM,
  EMPLOYMENT_LABELS,
  JOB_TITLE_LABELS,
  ROLE_LABELS,
  showRelatedOwnerInsuranceTip,
  STATUS_HINTS,
  STATUS_LABELS,
  type JobTitle,
} from "@/types/employee";
import {
  formatAgeDisplay,
  getUnder15WarningMessage,
  resolveAgeCompliance,
} from "@/lib/employee/age-compliance";
import {
  applyInsuranceBracket,
  formatInsuredSalaryLabel,
  FULL_TIME_INSURANCE_BRACKETS,
  getInsuranceBracket,
  guessInsuranceBracket,
  HEALTH_ENROLLMENT_LABELS,
  INSURANCE_BRACKET_YEAR,
  PART_TIME_INSURANCE_BRACKETS,
  type HealthInsuranceEnrollment,
} from "@/lib/payroll/insurance-brackets";

function resolveJobTitle(raw: string | null | undefined): JobTitle {
  if (raw === "nurse_lead") return "nurse_fulltime";
  if (raw && raw in JOB_TITLE_LABELS) return raw as JobTitle;
  return "nurse_fulltime";
}

function resolveHealthEnrollment(raw: string | null | undefined): HealthInsuranceEnrollment {
  if (raw === "dependent" || raw === "none" || raw === "clinic") return raw;
  return "clinic";
}

interface EmployeeModalProps {
  open: boolean;
  employee: Employee | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function EmployeeModal({ open, employee, onClose, onSuccess }: EmployeeModalProps) {
  const isEdit = !!employee;
  const [form, setForm] = useState<EmployeeFormData>(EMPTY_EMPLOYEE_FORM);
  const [insuredSalary, setInsuredSalary] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isAdminRole = form.role === "admin";

  const ageCompliance = useMemo(
    () => resolveAgeCompliance(form.birth_date, form.national_id),
    [form.birth_date, form.national_id]
  );

  const showOwnerTip = showRelatedOwnerInsuranceTip(form);

  useEffect(() => {
    if (!open) return;

    if (employee) {
      const loaded: EmployeeFormData = {
        employee_no: employee.employee_no,
        name: employee.name,
        role: employee.role,
        job_title: resolveJobTitle(employee.job_title),
        employment_type: employee.employment_type,
        status: employee.status,
        email: employee.email ?? "",
        phone: employee.phone ?? "",
        hire_date: employee.hire_date,
        birth_date: employee.birth_date ?? "",
        national_id: employee.national_id ?? "",
        health_insurance_enrollment: resolveHealthEnrollment(employee.health_insurance_enrollment),
        is_related_to_owner: Boolean(employee.is_related_to_owner),
        hourly_wage: Number(employee.hourly_wage),
        labor_insurance_self_pay: Number(employee.labor_insurance_self_pay),
        health_insurance_self_pay: Number(employee.health_insurance_self_pay),
        labor_insurance_employer_pay: Number(employee.labor_insurance_employer_pay ?? 0),
        health_insurance_employer_pay: Number(employee.health_insurance_employer_pay ?? 0),
        labor_pension_employer_pay: Number(employee.labor_pension_employer_pay ?? 0),
        is_clinic_admin: Boolean(employee.is_clinic_admin),
      };
      setForm(loaded);
      setInsuredSalary(
        guessInsuranceBracket({
          labor_insurance_self_pay: loaded.labor_insurance_self_pay,
          health_insurance_self_pay: loaded.health_insurance_self_pay,
          labor_insurance_employer_pay: loaded.labor_insurance_employer_pay,
        })
      );
    } else {
      setForm(EMPTY_EMPLOYEE_FORM);
      setInsuredSalary("");
    }
    setError(null);
    setSaveNotice(null);
  }, [open, employee]);

  if (!open) return null;

  function updateField<K extends keyof EmployeeFormData>(key: K, value: EmployeeFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleRoleChange(role: EmployeeFormData["role"]) {
    setForm((prev) => ({
      ...prev,
      role,
      is_clinic_admin: role === "admin" ? true : prev.is_clinic_admin,
    }));
  }

  function applyBracketToForm(salary: number, enrollment: HealthInsuranceEnrollment) {
    const bracket = getInsuranceBracket(salary);
    if (bracket) {
      setForm((prev) => ({ ...prev, ...applyInsuranceBracket(bracket, enrollment) }));
    }
  }

  function handleInsuredSalaryChange(value: string) {
    if (!value) {
      setInsuredSalary("");
      return;
    }
    const salary = Number(value);
    setInsuredSalary(salary);
    applyBracketToForm(salary, form.health_insurance_enrollment);
  }

  function handleHealthEnrollmentChange(enrollment: HealthInsuranceEnrollment) {
    updateField("health_insurance_enrollment", enrollment);
    if (insuredSalary !== "") {
      applyBracketToForm(insuredSalary, enrollment);
    } else if (enrollment !== "clinic") {
      setForm((prev) => ({
        ...prev,
        health_insurance_self_pay: 0,
        health_insurance_employer_pay: 0,
      }));
    }
  }

  function handleNationalIdChange(value: string) {
    const upper = value.toUpperCase();
    setForm((prev) => {
      const parsed = resolveAgeCompliance(prev.birth_date, upper);
      return {
        ...prev,
        national_id: upper,
        birth_date: !prev.birth_date && parsed.birthDate ? parsed.birthDate : prev.birth_date,
      };
    });
  }

  function submitForm(skipUnder15Confirm = false) {
    if (ageCompliance.status === "under_15" && !skipUnder15Confirm) {
      const ok = window.confirm(`${getUnder15WarningMessage()}\n\n仍要儲存此員工資料嗎？`);
      if (!ok) return;
    }

    setError(null);
    setSaveNotice(null);

    const payload: EmployeeFormData = {
      ...form,
      birth_date: ageCompliance.birthDate ?? form.birth_date,
      is_clinic_admin: form.role === "admin" ? true : form.is_clinic_admin,
    };

    startTransition(async () => {
      const result = isEdit
        ? await updateEmployee(employee!.id, payload)
        : await createEmployee(payload);

      if (!result.success) {
        setError(result.error);
        return;
      }

      if (result.isChildLaborer) {
        setSaveNotice("已標記為童工（15–16 歲）。排班系統將禁止 20:00–06:00 時段。");
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1800);
        return;
      }

      if (result.warning) {
        alert(result.warning);
      }

      onSuccess();
      onClose();
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submitForm(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="關閉"
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
      />

      <div className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="border-b border-slate-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-900">
            {isEdit ? "編輯員工" : "新增員工"}
          </h3>
          <p className="mt-1 text-sm text-slate-500">填寫診所員工基本資料與薪資設定</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 px-6 py-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {saveNotice && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {saveNotice}
            </div>
          )}

          {ageCompliance.status === "under_15" && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {getUnder15WarningMessage()}
            </div>
          )}

          {ageCompliance.status === "child_laborer" && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
              此同仁為童工（15–16 歲），儲存後將標記並禁止排入 20:00–06:00 診班。
            </div>
          )}

          <section>
            <h4 className="mb-3 text-sm font-semibold text-slate-700">基本資料</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Field label="員工編號" required>
                  <input
                    className={inputClass}
                    value={form.employee_no}
                    onChange={(e) => updateField("employee_no", e.target.value)}
                    placeholder="例如：QS001"
                  />
                </Field>
                <p className="mt-1 text-xs text-slate-400">
                  💡 建議使用診所編碼（如 QS001），避免直接填寫身分證字號以保護員工個資安全。
                </p>
              </div>
              <Field label="姓名" required>
                <input
                  className={inputClass}
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="例如：王護理師"
                />
              </Field>
              <Field label="生日">
                <input
                  type="date"
                  className={inputClass}
                  value={form.birth_date}
                  onChange={(e) => updateField("birth_date", e.target.value)}
                />
              </Field>
              <Field label="身分證字號（選填，可自動推算生日）">
                <input
                  className={inputClass}
                  value={form.national_id}
                  onChange={(e) => handleNationalIdChange(e.target.value.toUpperCase())}
                  placeholder="選填，僅供年齡檢核"
                  maxLength={10}
                />
              </Field>
              {ageCompliance.age != null && (
                <div className="sm:col-span-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  目前年齡：<span className="font-semibold text-slate-900">{formatAgeDisplay(ageCompliance)}</span>
                  {ageCompliance.isChildLaborer && (
                    <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">
                      童工
                    </span>
                  )}
                </div>
              )}
              <Field label="診所職稱" required>
                <select
                  className={inputClass}
                  value={form.job_title}
                  onChange={(e) => updateField("job_title", e.target.value as JobTitle)}
                >
                  {Object.entries(JOB_TITLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="系統角色" required>
                <select
                  className={inputClass}
                  value={form.role}
                  onChange={(e) => handleRoleChange(e.target.value as EmployeeFormData["role"])}
                >
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="sm:col-span-2">
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={form.is_related_to_owner}
                    onChange={(e) => updateField("is_related_to_owner", e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600"
                  />
                  <span className="text-sm text-slate-700">與診所負責人為直系血親關係</span>
                </label>
              </div>
              <div className="sm:col-span-2">
                <label
                  className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
                    isAdminRole
                      ? "cursor-default border-emerald-300 bg-emerald-50"
                      : "cursor-pointer border-emerald-200 bg-emerald-50/50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isAdminRole || form.is_clinic_admin}
                    disabled={isAdminRole}
                    onChange={(e) => updateField("is_clinic_admin", e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 disabled:opacity-70"
                  />
                  <span>
                    <span className="block text-sm font-medium text-slate-800">
                      LIFF 管理員權限
                      {isAdminRole && (
                        <span className="ml-2 text-xs font-normal text-emerald-700">
                          （系統角色為管理員，已自動啟用）
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      勾選後，此員工在 LINE 打卡頁可使用「管理員」分頁
                    </span>
                  </span>
                </label>
              </div>
              <Field label="雇用型態">
                <select
                  className={inputClass}
                  value={form.employment_type}
                  onChange={(e) =>
                    updateField("employment_type", e.target.value as EmployeeFormData["employment_type"])
                  }
                >
                  {Object.entries(EMPLOYMENT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="狀態">
                <select
                  className={inputClass}
                  value={form.status}
                  onChange={(e) => updateField("status", e.target.value as EmployeeFormData["status"])}
                >
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">{STATUS_HINTS[form.status]}</p>
                {form.status === "active" && (
                  <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs leading-relaxed text-amber-900">
                    防呆提醒：若員工請完「產假」後需銜接「育嬰留職停薪」，請再手動將狀態改為
                    「停職（育嬰／懷孕）」，系統才會切換為政府補助免繳（雇主勞健保／勞退歸零）模式。產假期間請維持「在職」。
                  </p>
                )}
              </Field>
              <Field label="到職日（特休週年制起算）" required>
                <input
                  type="date"
                  className={inputClass}
                  value={form.hire_date}
                  onChange={(e) => updateField("hire_date", e.target.value)}
                />
              </Field>
              <Field label="電話">
                <input
                  className={inputClass}
                  value={form.phone}
                  onChange={(e) => updateField("phone", e.target.value)}
                  placeholder="09xx-xxx-xxx"
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  className={inputClass}
                  value={form.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  placeholder="name@example.com"
                />
              </Field>
            </div>
          </section>

          <section>
            <h4 className="mb-3 text-sm font-semibold text-slate-700">薪資與保險</h4>

            {showOwnerTip && (
              <p className="mb-4 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-900">
                💡 溫馨提示：直系血親於獨資診所工作加保勞保時，請務必保留實際打卡紀錄（可匯出 LIFF
                打卡單）與薪資轉帳證明，以利勞保局查核僱用事實。
              </p>
            )}

            <div className="mb-4 grid gap-4 sm:grid-cols-2">
              <Field label={`投保薪資級距（${INSURANCE_BRACKET_YEAR} 年表）`}>
                <select
                  className={inputClass}
                  value={insuredSalary === "" ? "" : String(insuredSalary)}
                  onChange={(e) => handleInsuredSalaryChange(e.target.value)}
                >
                  <option value="">— 手動輸入或選擇級距 —</option>
                  <optgroup label="部分工時（低於基本工資 $29,500，工讀/兼職）">
                    {PART_TIME_INSURANCE_BRACKETS.map((b) => (
                      <option key={b.insuredSalary} value={b.insuredSalary}>
                        {formatInsuredSalaryLabel(b.insuredSalary, "part_time")}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="全職（$29,500 – $45,800，共 11 級）">
                    {FULL_TIME_INSURANCE_BRACKETS.map((b) => (
                      <option key={b.insuredSalary} value={b.insuredSalary}>
                        {formatInsuredSalaryLabel(b.insuredSalary, "full_time")}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </Field>
              <Field label="健保投保方式">
                <select
                  className={inputClass}
                  value={form.health_insurance_enrollment}
                  onChange={(e) =>
                    handleHealthEnrollmentChange(e.target.value as HealthInsuranceEnrollment)
                  }
                >
                  {Object.entries(HEALTH_ENROLLMENT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <p className="mb-4 text-xs text-slate-500">
              選取級距後，勞保、勞退與健保（依投保方式）將自動帶入；工讀生若健保掛父母名下，請選「眷屬依附／不在此投保」。
            </p>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="時薪（NT$）" required>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className={inputClass}
                  value={form.hourly_wage || ""}
                  onChange={(e) => updateField("hourly_wage", Number(e.target.value))}
                  placeholder="220"
                />
              </Field>
              <Field label="勞保個人自付（NT$）">
                <input
                  type="number"
                  min={0}
                  step={1}
                  className={inputClass}
                  value={form.labor_insurance_self_pay || ""}
                  onChange={(e) => updateField("labor_insurance_self_pay", Number(e.target.value))}
                  placeholder="依級距"
                />
              </Field>
              <Field label="健保個人自付（NT$）">
                <input
                  type="number"
                  min={0}
                  step={1}
                  className={inputClass}
                  value={form.health_insurance_self_pay || ""}
                  onChange={(e) => updateField("health_insurance_self_pay", Number(e.target.value))}
                  placeholder="依級距"
                  disabled={form.health_insurance_enrollment !== "clinic"}
                />
              </Field>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="勞保雇主負擔（NT$）">
                <input
                  type="number"
                  min={0}
                  step={1}
                  className={inputClass}
                  value={form.labor_insurance_employer_pay || ""}
                  onChange={(e) =>
                    updateField("labor_insurance_employer_pay", Number(e.target.value))
                  }
                  placeholder="依級距"
                />
              </Field>
              <Field label="健保雇主負擔（NT$）">
                <input
                  type="number"
                  min={0}
                  step={1}
                  className={inputClass}
                  value={form.health_insurance_employer_pay || ""}
                  onChange={(e) =>
                    updateField("health_insurance_employer_pay", Number(e.target.value))
                  }
                  placeholder="依級距"
                  disabled={form.health_insurance_enrollment !== "clinic"}
                />
              </Field>
              <Field label="勞退雇主提繳 6%（NT$）">
                <input
                  type="number"
                  min={0}
                  step={1}
                  className={inputClass}
                  value={form.labor_pension_employer_pay || ""}
                  onChange={(e) =>
                    updateField("labor_pension_employer_pay", Number(e.target.value))
                  }
                  placeholder="依級距"
                />
              </Field>
            </div>
          </section>

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {isPending ? "儲存中..." : isEdit ? "儲存變更" : "新增員工"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500";
