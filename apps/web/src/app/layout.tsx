import type { Metadata } from 'next';
import { DM_Serif_Display } from 'next/font/google';
import { Providers } from './providers';
import { Navbar } from '@/components/layout/Navbar';
import { BottomNav } from '@/components/layout/BottomNav';
import { AppShell } from '@/components/layout/AppShell';
import { ToastContainer } from '@/components/layout/ToastContainer';
import { AIAdvisorDrawer } from '@/components/advisor/AIAdvisorDrawer';
// I3.1：DemoControlTrigger 已迁回 HomeHeader（Avatar 旁，符合设计稿）。
// 这里仍全局挂载 DemoControlDrawer（通过 MountedDemoControl 包装），
// 让 HomeHeader 里的 Trigger 通过 `useGodModeStore.toggleOpen` 跨组件
// 控制开合；本组件不再渲染任何可见入口，故无需 fixed 定位。
import { MountedDemoControl } from '@/components/demo-control/MountedDemoControl';
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
  title: 'VALO',
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
                {/*
                  DemoControlDrawer 全局挂载：HomeHeader 内的 Trigger 通过
                  useGodModeStore.toggleOpen 跨组件控制开合。这里不需要可见入口，
                  因此不再 fixed 定位；Drawer 自身会以 fixed 遮罩形式呈现。
                */}
                <MountedDemoControl />
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
