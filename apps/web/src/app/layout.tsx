import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Health Advisor',
  description: '智能健康顾问',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
