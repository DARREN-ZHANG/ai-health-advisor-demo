import type { Metadata } from 'next';
import { DM_Serif_Display } from 'next/font/google';
import { Providers } from './providers';
import { Navbar } from '@/components/layout/Navbar';
import { BottomNav } from '@/components/layout/BottomNav';
import { AppShell } from '@/components/layout/AppShell';
import { ToastContainer } from '@/components/layout/ToastContainer';
import { AIAdvisorTrigger } from '@/components/advisor/AIAdvisorTrigger';
import { AIAdvisorDrawer } from '@/components/advisor/AIAdvisorDrawer';
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
