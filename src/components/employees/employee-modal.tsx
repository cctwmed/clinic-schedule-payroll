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

interface EmployeeModalProps {
  open: boolean;
  employee: Employee | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function EmployeeModal({ open, employee, onClose, onSuccess }: EmployeeModalProps) {
  const isEdit = !!employee;
  const [form, setForm] = useState<EmployeeFormData>(EMPTY_EMPLOYEE_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;

    if (employee) {
      setForm({
        employee_no: employee.employee_no,
        name: employee.name,
        role: employee.role,
        job_title: (employee.job_title as JobTitle) || "nurse_fulltime",
        employment_type: employee.employment_type,
        status: employee.status,
        email: employee.email ?? "",
        phone: employee.phone ?? "",
        hire_date: employee.hire_date,
        hourly_wage: Number(employee.hourly_wage),
        labor_insurance_self_pay: Number(employee.labor_insurance_self_pay),
        health_insurance_self_pay: Number(employee.health_insurance_self_pay),
      });
    } else {
      setForm(EMPTY_EMPLOYEE_FORM);
    }
    setError(null);
  }, [open, employee]);

  if (!open) return null;

  function updateField<K extends keyof EmployeeFormData>(key: K, value: EmployeeFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = isEdit
        ? await updateEmployee(employee!.id, form)
        : await createEmployee(form);

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
              <Field label="員工編號" required>
                <input
                  className={inputClass}
                  value={form.employee_no}
                  onChange={(e) => updateField("employee_no", e.target.value)}
                  placeholder="例如：N001"
                />
              </Field>
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
                  onChange={(e) => updateField("role", e.target.value as EmployeeFormData["role"])}
                >
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
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
              <Field label="到職日" required>
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
              <Field label="勞保自付額（NT$）">
                <input
                  type="number"
                  min={0}
                  step={1}
                  className={inputClass}
                  value={form.labor_insurance_self_pay || ""}
                  onChange={(e) => updateField("labor_insurance_self_pay", Number(e.target.value))}
                  placeholder="1100"
                />
              </Field>
              <Field label="健保自付額（NT$）">
                <input
                  type="number"
                  min={0}
                  step={1}
                  className={inputClass}
                  value={form.health_insurance_self_pay || ""}
                  onChange={(e) => updateField("health_insurance_self_pay", Number(e.target.value))}
                  placeholder="450"
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
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
