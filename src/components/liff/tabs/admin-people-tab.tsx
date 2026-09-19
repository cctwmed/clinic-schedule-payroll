"use client";

import { useEffect, useState } from "react";
import { adminRequestInit } from "@/lib/liff/admin-session";

interface AdminPeopleTabProps {
  lineUserId: string;
}

export function AdminPeopleTab({ lineUserId }: AdminPeopleTabProps) {
  const [rows, setRows] = useState<
    { id: string; name: string; employeeNo: string; role: string; status: string; isClinicAdmin: boolean }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const req = adminRequestInit(lineUserId);
    fetch(`/api/mobile/admin/people?${req.query}`, {
      credentials: "include",
      headers: req.headers,
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "載入失敗");
        setRows(json.employees ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "載入失敗"))
      .finally(() => setLoading(false));
  }, [lineUserId]);

  if (loading) return <p className="py-12 text-center text-sm text-black">載入同仁…</p>;
  if (error) {
    return <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>;
  }

  return (
    <div className="space-y-2 pb-8">
      {rows.map((row) => (
        <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-3">
          <p className="text-sm font-bold text-black">{row.name}</p>
          <p className="text-xs text-black">
            {row.employeeNo} · {row.role} · {row.status}
            {row.isClinicAdmin ? " · 管理員" : ""}
          </p>
        </div>
      ))}
    </div>
  );
}
