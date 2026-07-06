import type { Metadata } from 'next';
import { DM_Serif_Display } from 'next/font/google';
import { Providers } from './providers';
import { Navbar } from '@/components/layout/Navbar';
import { BottomNav } from '@/components/layout/BottomNav';
import { AppShell } from '@/components/layout/AppShell';
import { ToastContainer } from '@/components/layout/ToastContainer';
import { AIAdvisorTrigger } from '@/components/advisor/AIAdvisorTrigger';
import { AIAdvisorDrawer } from '@/components/advisor/AIAdvisorDrawer';
// TEMP（I2.2）：Demo Control 入口与抽屉临时挂载到 layout，
// 用于在 God Mode 启用时手动验证抽屉开合。I6.1 会按设计把入口
// 移到 HomeHeader 的 Avatar 旁，并移除这里的临时挂载点。
import { DemoControlTrigger } from '@/components/demo-control/DemoControlTrigger';
import { DemoControlDrawer } from '@/components/demo-control/DemoControlDrawer';
import './globals.css';

/**
 * DM Serif Display：Hero 状态标题、时间段标题专用。
 * 通过 next/font 在构建期自托管，避免运行期外部请求与 CLS。
 * 变量名 --font-dm-serif 注入到 globals.css 中 --valo-font-serif 的栈首，
 * 作为 Valo 设计 token 的字体回退链顶端。
 */
const dmSerif = DM_Serif_Display({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-dm-serif',
});

export const metadata: Metadata = {
  title: 'AI Health Advisor',
  description: '智能健康顾问 - 你的个人 AI 健康专家',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={`${dmSerif.variable} antialiased min-h-screen`}
        style={{
          backgroundColor: 'var(--valo-canvas)',
          color: 'var(--valo-text-primary)',
        }}
      >
        <Providers>
          <AppShell
            navbar={<Navbar />}
            bottomNav={<BottomNav />}
            floating={
              <>
                {/* TEMP（I2.2）：Demo Control 临时浮动入口；I6.1 会迁移到 HomeHeader */}
                <div className="fixed left-4 top-4 z-40">
                  <DemoControlTrigger />
                </div>
                <DemoControlDrawer />
                <AIAdvisorTrigger />
                <AIAdvisorDrawer />
              </>
            }
            overlay={<ToastContainer />}
          >
            {children}
          </AppShell>
        </Providers>
      </body>
    </html>
  );
}
