import { ClockExportDocument } from "@/components/clock-records/clock-export-document";
import { fetchClockRecordsExportData } from "@/app/(dashboard)/clock-records/actions";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string; employee?: string }>;
}

export default async function ClockRecordsExportPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
  const [y, m] = today.split("-");
  const defaultFrom = `${y}-${m}-01`;
  const lastDay = new Date(Number(y), Number(m), 0).getDate();
  const defaultTo = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;

  const fromDate = params.from ?? defaultFrom;
  const toDate = params.to ?? defaultTo;
  const employeeId = params.employee || null;

  try {
    const data = await fetchClockRecordsExportData(fromDate, toDate, employeeId);
    const employeeFilter = employeeId
      ? data.employees.find((e) => e.id === employeeId)
      : null;

    return (
      <ClockExportDocument
        clinicName={data.clinic.name}
        clinicAddress={data.clinic.address}
        fromDate={fromDate}
        toDate={toDate}
        employeeFilter={
          employeeFilter ? `${employeeFilter.name}（${employeeFilter.employee_no}）` : null
        }
        rows={data.rows}
      />
    );
  } catch (err) {
    return (
      <div className="p-8 text-center text-sm text-red-700">
        載入匯出資料失敗：{err instanceof Error ? err.message : "未知錯誤"}
      </div>
    );
  }
}
