import { supabase } from "@/lib/supabase";
import { sumTaxForm50NonRecurring } from "@/lib/payroll/constants";

export interface AnnualEmployeeSummary {
  employeeId: string;
  employeeName: string;
  employeeNo: string;
  recurringGross: number;
  /** 50 格式應稅非經常性合計（不含免稅加班／國定≤8h） */
  nonRecurringTotal: number;
  totalGross: number;
  flexibleBonus: number;
  quarterlyBonus: number;
  yearEndBonus: number;
}

export interface AnnualPayrollSummary {
  year: number;
  employees: AnnualEmployeeSummary[];
  clinicTotalGross: number;
  clinicNonRecurring: number;
  clinicRecurring: number;
}

interface BreakdownRow {
  flexibleBonus?: number;
  quarterlyBonus?: number;
  yearEndBonus?: number;
  annualLeavePayout?: number;
  holidayOvertimePay?: number;
  taxForm50NonRecurring?: number;
  recurringGross?: number;
  gross_pay?: number;
}

export async function fetchAnnualPayrollSummary(
  clinicId: string,
  year: number
): Promise<AnnualPayrollSummary> {
  const { data: runs } = await supabase
    .from("payroll_runs")
    .select("id, month")
    .eq("clinic_id", clinicId)
    .eq("year", year)
    .order("month");

  if (!runs?.length) {
    return {
      year,
      employees: [],
      clinicTotalGross: 0,
      clinicNonRecurring: 0,
      clinicRecurring: 0,
    };
  }

  const runIds = runs.map((r) => r.id);
  const { data: items } = await supabase
    .from("payroll_items")
    .select("employee_id, gross_pay, breakdown, employees(name, employee_no)")
    .in("payroll_run_id", runIds);

  const byEmployee = new Map<
    string,
    {
      name: string;
      no: string;
      recurring: number;
      flexible: number;
      quarterly: number;
      yearEnd: number;
      gross: number;
      tax50: number;
    }
  >();

  for (const item of items ?? []) {
    const bd = (item.breakdown ?? {}) as BreakdownRow;
    const emp = parseEmployeeJoin(item.employees);
    const id = item.employee_id;

    if (!byEmployee.has(id)) {
      byEmployee.set(id, {
        name: emp?.name ?? "—",
        no: emp?.employee_no ?? "",
        recurring: 0,
        flexible: 0,
        quarterly: 0,
        yearEnd: 0,
        gross: 0,
        tax50: 0,
      });
    }

    const row = byEmployee.get(id)!;
    const flex = Number(bd.flexibleBonus ?? 0);
    const q = Number(bd.quarterlyBonus ?? 0);
    const ye = Number(bd.yearEndBonus ?? 0);
    const annualLeave = Number(bd.annualLeavePayout ?? 0);
    const holidayOt = Number(bd.holidayOvertimePay ?? 0);
    const tax50 =
      bd.taxForm50NonRecurring != null
        ? Number(bd.taxForm50NonRecurring)
        : sumTaxForm50NonRecurring({
            flexibleBonus: flex,
            quarterlyBonus: q,
            yearEndBonus: ye,
            annualLeavePayout: annualLeave,
            holidayOvertimePay: holidayOt,
          });
    const recurring = Number(bd.recurringGross ?? 0);
    const gross = Number(item.gross_pay ?? 0);

    row.flexible += flex;
    row.quarterly += q;
    row.yearEnd += ye;
    row.recurring += recurring > 0 ? recurring : Math.max(0, gross - tax50);
    row.gross += gross;
    row.tax50 += tax50;
  }

  const employees: AnnualEmployeeSummary[] = [...byEmployee.entries()].map(
    ([employeeId, row]) => {
      const nonRecurringTotal = Math.round(row.tax50);
      return {
        employeeId,
        employeeName: row.name,
        employeeNo: row.no,
        recurringGross: Math.round(row.recurring),
        nonRecurringTotal,
        totalGross: Math.round(row.recurring + nonRecurringTotal),
        flexibleBonus: row.flexible,
        quarterlyBonus: row.quarterly,
        yearEndBonus: row.yearEnd,
      };
    }
  );

  const clinicTotalGross = employees.reduce((s, e) => s + e.totalGross, 0);
  const clinicNonRecurring = employees.reduce((s, e) => s + e.nonRecurringTotal, 0);
  const clinicRecurring = employees.reduce((s, e) => s + e.recurringGross, 0);

  return {
    year,
    employees: employees.sort((a, b) => a.employeeNo.localeCompare(b.employeeNo)),
    clinicTotalGross,
    clinicNonRecurring,
    clinicRecurring,
  };
}

function parseEmployeeJoin(raw: unknown): { name?: string; employee_no?: string } | null {
  if (!raw) return null;
  const item = Array.isArray(raw) ? raw[0] : raw;
  return item as { name?: string; employee_no?: string };
}
