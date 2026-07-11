import { SchedulePageClient } from "@/components/schedules/schedule-page-client";
import { LegalWarningBanner } from "@/components/compliance/legal-warning-banner";
import { fetchSchedulePageData } from "./actions";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ year?: string; month?: string }>;
}

export default async function SchedulesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const now = new Date();
  const year = params.year ? Number(params.year) : now.getFullYear();
  const month = params.month ? Number(params.month) : now.getMonth() + 1;

  try {
    const data = await fetchSchedulePageData(year, month);
    return (
      <>
        <LegalWarningBanner />
        <SchedulePageClient
          initialYear={year}
          initialMonth={month}
          clinic={data.clinic}
          schedule={data.schedule}
          shiftTypes={data.shiftTypes}
          offDayShiftTypes={data.offDayShiftTypes}
          employees={data.employees}
          assignmentMap={data.assignmentMap}
          daysInMonth={data.daysInMonth}
          complianceIssues={data.complianceIssues}
          goldenConfig={data.goldenConfig}
        />
      </>
    );
  } catch (err) {
    return (
      <>
        <LegalWarningBanner />
        <div className="p-6">
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            載入排班資料失敗：{err instanceof Error ? err.message : "未知錯誤"}
          </div>
        </div>
      </>
    );
  }
}
