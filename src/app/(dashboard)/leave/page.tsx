import { LeavePageClient } from "@/components/leave/leave-page-client";
import { fetchLeavePageData } from "./actions";

export const dynamic = "force-dynamic";

export default async function LeavePage() {
  try {
    const data = await fetchLeavePageData();
    return <LeavePageClient clinicName={data.clinicName} summaries={data.summaries} />;
  } catch (err) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          載入特休資料失敗：{err instanceof Error ? err.message : "未知錯誤"}
        </div>
      </div>
    );
  }
}
