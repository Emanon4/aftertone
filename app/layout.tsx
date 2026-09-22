import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "余音 Aftertone — 下一首，你的单曲循环。",
  description: "从一首喜欢的歌出发，发现下一首会留下来的声音。",
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
    <html lang="zh-CN" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
