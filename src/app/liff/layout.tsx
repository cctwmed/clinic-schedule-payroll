export default function LiffLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-slate-100 text-slate-900">
      {children}
    </div>
  );
}
