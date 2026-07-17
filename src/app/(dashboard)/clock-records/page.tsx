import { ClockRecordsPageClient } from "@/components/clock-records/clock-records-page-client";
import { fetchClockRecordsPageData } from "./actions";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ date?: string }>;
}

export default async function ClockRecordsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  try {
    const data = await fetchClockRecordsPageData(params.date);
    return (
      <ClockRecordsPageClient
        clinicName={data.clinic.name}
        date={data.date}
        records={data.records}
        pendingEarlyReview={data.pendingEarlyReview}
        pendingCorrections={data.pendingCorrections}
        employees={data.employees}
      />
    );
  } catch (err) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          載入打卡紀錄失敗：{err instanceof Error ? err.message : "未知錯誤"}
        </div>
      </div>
    );
  }
}
