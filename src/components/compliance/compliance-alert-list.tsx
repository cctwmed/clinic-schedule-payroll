import type { ComplianceIssue } from "@/lib/compliance/types";

interface ComplianceAlertListProps {
  issues: ComplianceIssue[];
  maxItems?: number;
}

export function ComplianceAlertList({ issues, maxItems = 8 }: ComplianceAlertListProps) {
  if (issues.length === 0) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
        目前未偵測到四週變形工時合規問題（已依黃金班表與四週週期檢查）
      </div>
    );
  }

  const display = issues.slice(0, maxItems);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">
        合規預警（{issues.length} 項）
      </p>
      <ul className="max-h-64 space-y-2 overflow-y-auto">
        {display.map((issue, idx) => (
          <li
            key={`${issue.ruleCode}-${idx}`}
            className={`rounded-lg border px-3 py-2 text-sm ${
              issue.severity === "violation"
                ? "border-red-200 bg-red-50 text-red-800"
                : issue.severity === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-slate-200 bg-slate-50 text-slate-700"
            }`}
          >
            {issue.message}
          </li>
        ))}
      </ul>
      {issues.length > maxItems && (
        <p className="text-xs text-slate-500">另有 {issues.length - maxItems} 項未顯示</p>
      )}
    </div>
  );
}
