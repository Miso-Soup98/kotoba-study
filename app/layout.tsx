import type { Metadata } from "next";
import "./globals.css";
import "./vocabulary.css";

export const metadata: Metadata = {
  title: "言葉 · 日语学习",
  description: "N5–N1分级单词、622条语法与间隔复习。在手机和电脑上继续你的日语学习。",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "言葉", statusBarStyle: "default" },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
