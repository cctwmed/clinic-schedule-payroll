"use client";

import { useEffect, useState, useTransition } from "react";
import { createEmployee, updateEmployee } from "@/app/(dashboard)/employees/actions";
import type { Employee, EmployeeFormData } from "@/types/employee";
import {
  EMPTY_EMPLOYEE_FORM,
  EMPLOYMENT_LABELS,
  JOB_TITLE_LABELS,
  ROLE_LABELS,
  STATUS_LABELS,
  type JobTitle,
} from "@/types/employee";
import {
  applyInsuranceBracket,
  formatInsuredSalaryLabel,
  getInsuranceBracket,
  guessInsuranceBracket,
  INSURANCE_BRACKETS,
  INSURANCE_BRACKET_YEAR,
} from "@/lib/payroll/insurance-brackets";

function resolveJobTitle(raw: string | null | undefined): JobTitle {
  if (raw === "nurse_lead") return "nurse_fulltime";
  if (raw && raw in JOB_TITLE_LABELS) {
    return raw as JobTitle;
  }
  return "nurse_fulltime";
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
  const [isPending, startTransition] = useTransition();

  const isAdminRole = form.role === "admin";

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

  function handleInsuredSalaryChange(value: string) {
    if (!value) {
      setInsuredSalary("");
      return;
    }
    const salary = Number(value);
    setInsuredSalary(salary);
    const bracket = getInsuranceBracket(salary);
    if (bracket) {
      setForm((prev) => ({ ...prev, ...applyInsuranceBracket(bracket) }));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload: EmployeeFormData = {
      ...form,
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

      onSuccess();
      onClose();
    });
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
                      勾選後，此員工在 LINE 打卡頁可使用「管理員」分頁（審核、排班、薪資等後台連結）
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
            <div className="mb-4">
              <Field label={`投保薪資級距（${INSURANCE_BRACKET_YEAR} 年表，投保薪資）`}>
                <select
                  className={inputClass}
                  value={insuredSalary === "" ? "" : String(insuredSalary)}
                  onChange={(e) => handleInsuredSalaryChange(e.target.value)}
                >
                  <option value="">— 手動輸入或選擇級距 —</option>
                  {INSURANCE_BRACKETS.map((b) => (
                    <option key={b.insuredSalary} value={b.insuredSalary}>
                      {formatInsuredSalaryLabel(b.insuredSalary)}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="mt-1 text-xs text-slate-500">
                選取級距後，勞健保個人自付、雇主負擔與勞退 6% 將自動帶入（仍可微調）。
              </p>
            </div>
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
            <p className="mt-2 text-xs text-slate-500">
              個人自付額於薪資結算時自實領扣除；雇主負擔與勞退列入診所規費及應繳政府總額。
            </p>
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
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
