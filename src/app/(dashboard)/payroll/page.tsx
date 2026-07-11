import { LegalWarningBanner } from "@/components/compliance/legal-warning-banner";
import { PayrollPageClient } from "@/components/payroll/payroll-page-client";
import { fetchPayrollPageData } from "./actions";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ year?: string; month?: string }>;
}

export default async function PayrollPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const now = new Date();
  const year = params.year ? Number(params.year) : now.getFullYear();
  const month = params.month ? Number(params.month) : now.getMonth() + 1;

  try {
    const data = await fetchPayrollPageData(year, month);
    return (
      <>
        <LegalWarningBanner />
        <PayrollPageClient
          year={data.year}
          month={data.month}
          periodStart={data.periodStart}
          periodEnd={data.periodEnd}
          lineItems={data.lineItems}
          complianceIssues={data.complianceIssues}
          dbAlerts={data.dbAlerts}
          existingRun={data.existingRun}
          isQuarterlyMonth={data.isQuarterlyMonth}
          isYearEndMonth={data.isYearEndMonth}
          quarterLabel={data.quarterLabel}
          annualSummary={data.annualSummary}
        />
      </>
    );
  } catch (err) {
    return (
      <>
        <LegalWarningBanner />
        <div className="p-6">
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            載入薪資資料失敗：{err instanceof Error ? err.message : "未知錯誤"}
          </div>
        </div>
      </>
    );
  }
}
