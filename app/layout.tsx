import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Amazon Expert Console",
  description: "Amazon Expert frontend with login, home, pricing and chat pages",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
