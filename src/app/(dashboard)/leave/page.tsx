import { LeavePageClient } from "@/components/leave/leave-page-client";
import { fetchLeavePageData } from "./actions";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ year?: string; month?: string }>;
}

export default async function LeavePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const now = new Date();
  const year = params.year ? Number(params.year) : now.getFullYear();
  const month = params.month ? Number(params.month) : now.getMonth() + 1;

  try {
    const data = await fetchLeavePageData(year, month);
    return (
      <LeavePageClient
        clinicName={data.clinicName}
        summaries={data.summaries}
        pendingRequests={data.pendingRequests}
        monthlyApproved={data.monthlyApproved}
        balances={data.balances}
        year={data.year}
        month={data.month}
      />
    );
  } catch (err) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          載入請假資料失敗：{err instanceof Error ? err.message : "未知錯誤"}
        </div>
      </div>
    );
  }
}
