import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "英文 Quiz",
  description: "儿童英文读物与动画配套练习题",
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
