import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "診所排班支薪系統",
  description: "小型醫療診所排班、打卡、薪資與勞基法合規管理",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body className="antialiased">{children}</body>
    </html>
  );
}
