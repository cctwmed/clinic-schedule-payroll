"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DashboardHeader } from "@/components/layout/sidebar";
import { EmployeeModal } from "@/components/employees/employee-modal";
import type { Employee } from "@/types/employee";
import {
  displayJobTitle,
  EMPLOYMENT_LABELS,
  STATUS_LABELS,
  formatCurrency,
} from "@/types/employee";

export function EmployeesPageClient({ employees }: { employees: Employee[] }) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  function openCreate() {
    setEditingEmployee(null);
    setModalOpen(true);
  }

  function openEdit(employee: Employee) {
    setEditingEmployee(employee);
    setModalOpen(true);
  }

  function handleSuccess() {
    setModalOpen(false);
    router.refresh();
  }

  return (
    <>
      <DashboardHeader
        title="員工管理"
        description="管理診所護理師與行政人員的基本資料、時薪與勞健保設定"
        action={
          <button
            onClick={openCreate}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            ＋ 新增員工
          </button>
        }
      />

      <div className="p-6">
        {employees.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
            <p className="text-base font-medium text-slate-700">尚無員工資料</p>
            <p className="mt-1 text-sm text-slate-500">點擊「新增員工」開始建立第一位護理師</p>
            <button
              onClick={openCreate}
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              新增第一位員工
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">編號</th>
                    <th className="px-4 py-3">姓名</th>
                    <th className="px-4 py-3">職稱</th>
                    <th className="px-4 py-3">雇用</th>
                    <th className="px-4 py-3">時薪</th>
                    <th className="px-4 py-3">勞保自付</th>
                    <th className="px-4 py-3">健保自付</th>
                    <th className="px-4 py-3">狀態</th>
                    <th className="px-4 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {employees.map((employee) => (
                    <tr key={employee.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-medium text-slate-900">{employee.employee_no}</td>
                      <td className="px-4 py-3 text-slate-800">{employee.name}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-700">
                          {displayJobTitle(employee.job_title, employee.role)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {EMPLOYMENT_LABELS[employee.employment_type]}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {formatCurrency(Number(employee.hourly_wage))}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatCurrency(Number(employee.labor_insurance_self_pay))}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatCurrency(Number(employee.health_insurance_self_pay))}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={employee.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => openEdit(employee)}
                          className="rounded-md px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50"
                        >
                          編輯
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <EmployeeModal
        open={modalOpen}
        employee={editingEmployee}
        onClose={() => setModalOpen(false)}
        onSuccess={handleSuccess}
      />
    </>
  );
}

function StatusBadge({ status }: { status: Employee["status"] }) {
  const styles: Record<Employee["status"], string> = {
    active: "bg-green-100 text-green-700",
    inactive: "bg-slate-100 text-slate-600",
    resigned: "bg-red-100 text-red-700",
  };

  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
