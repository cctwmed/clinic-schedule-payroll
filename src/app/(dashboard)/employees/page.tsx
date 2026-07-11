import { EmployeesPageClient } from "@/components/employees/employees-page-client";
import { fetchEmployees } from "./actions";
import type { Employee } from "@/types/employee";

export default async function EmployeesPage() {
  let employees: Employee[] = [];
  let error: string | null = null;

  try {
    employees = (await fetchEmployees()) as Employee[];
  } catch (err) {
    error = err instanceof Error ? err.message : "無法載入員工資料";
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          載入失敗：{error}
        </div>
      </div>
    );
  }

  return <EmployeesPageClient employees={employees} />;
}
