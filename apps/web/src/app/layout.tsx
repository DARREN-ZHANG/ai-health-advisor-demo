import type { Metadata } from 'next';
import { Providers } from './providers';
import { Navbar } from '@/components/layout/Navbar';
import { BottomNav } from '@/components/layout/BottomNav';
import { ToastContainer } from '@/components/layout/ToastContainer';
import { ActiveSensingBanner } from '@/components/layout/ActiveSensingBanner';
import { AIAdvisorTrigger } from '@/components/advisor/AIAdvisorTrigger';
import { AIAdvisorDrawer } from '@/components/advisor/AIAdvisorDrawer';
import { GodModePanel } from '@/components/god-mode/GodModePanel';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Health Advisor',
  description: '智能健康顾问 - 你的个人 AI 健康专家',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased min-h-screen bg-slate-950 text-slate-200">
        <Providers>
          <div className="relative flex flex-col min-h-screen pb-16 md:pb-0">
            <Navbar />
            <main className="flex-1">
              {children}
            </main>
            <BottomNav />
            <AIAdvisorTrigger />
            <AIAdvisorDrawer />
            <GodModePanel />
            <ToastContainer />
            <ActiveSensingBanner />
          </div>
        </Providers>
      </body>
    </html>
  );
}
