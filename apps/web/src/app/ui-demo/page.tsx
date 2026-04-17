'use client';

import {
  Container,
  Section,
  Card,
  Grid,
  StatusBadge,
  Pill,
  InlineHint,
  MicroTip,
  Button,
  IconButton,
  Tabs,
  Drawer,
  Modal,
  Skeleton,
  EmptyState,
  InlineError,
  LoadingDots,
} from '@health-advisor/ui';
import { useState } from 'react';

export default function UiDemoPage() {
  const [activeTab, setActiveTab] = useState('layout');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const tabs = [
    { id: 'layout', label: '布局' },
    { id: 'status', label: '状态' },
    { id: 'interactive', label: '交互' },
    { id: 'feedback', label: '反馈' },
  ];

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <Container>
        <h1 className="text-2xl font-bold mb-6">UI 组件 Smoke Demo</h1>

        <Tabs items={tabs} activeId={activeTab} onSelect={setActiveTab} />

        <div className="mt-6">
          {activeTab === 'layout' && (
            <Section title="布局组件">
              <div className="space-y-4">
                <Card>
                  <h3 className="text-sm font-medium mb-2">Card</h3>
                  <p className="text-sm text-slate-400">暗色主题卡片容器</p>
                </Card>
                <Grid cols={3}>
                  <Card><p className="text-xs">Grid 1</p></Card>
                  <Card><p className="text-xs">Grid 2</p></Card>
                  <Card><p className="text-xs">Grid 3</p></Card>
                </Grid>
              </div>
            </Section>
          )}

          {activeTab === 'status' && (
            <Section title="状态组件">
              <div className="space-y-4">
                <div className="flex gap-3 flex-wrap">
                  <StatusBadge status="good" label="良好" />
                  <StatusBadge status="warning" label="注意" />
                  <StatusBadge status="alert" label="警告" />
                  <StatusBadge status="neutral" label="正常" />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Pill>HRV</Pill>
                  <Pill>睡眠</Pill>
                  <Pill>压力</Pill>
                </div>
                <InlineHint>这是一个行内提示</InlineHint>
                <MicroTip>建议每天保持 7-8 小时的睡眠</MicroTip>
              </div>
            </Section>
          )}

          {activeTab === 'interactive' && (
            <Section title="交互组件">
              <div className="space-y-4">
                <div className="flex gap-3 flex-wrap items-center">
                  <Button variant="primary">主要按钮</Button>
                  <Button variant="secondary">次要按钮</Button>
                  <Button variant="ghost">幽灵按钮</Button>
                  <IconButton>+</IconButton>
                </div>
                <div className="flex gap-3">
                  <Button onClick={() => setDrawerOpen(true)}>打开 Bottom Drawer</Button>
                  <Button onClick={() => setModalOpen(true)} variant="ghost">打开 Modal</Button>
                </div>
              </div>

              <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="抽屉面板" side="bottom" size="md">
                <div className="space-y-4">
                  <p className="text-sm text-slate-400">底部抽屉内容区域，支持弹性动画与磨砂背景。</p>
                  <Button onClick={() => setDrawerOpen(false)} className="w-full">关闭</Button>
                </div>
              </Drawer>

              <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="模态弹窗">
                <p className="text-sm text-slate-400">弹窗内容区域</p>
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setModalOpen(false)}>取消</Button>
                  <Button onClick={() => setModalOpen(false)}>确认</Button>
                </div>
              </Modal>
            </Section>
          )}

          {activeTab === 'feedback' && (
            <Section title="反馈组件">
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs text-slate-500">Skeleton</p>
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-20 w-full" />
                </div>
                <EmptyState message="暂无数据" />
                <InlineError message="数据加载失败，请重试" />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">LoadingDots:</span>
                  <LoadingDots />
                </div>
              </div>
            </Section>
          )}
        </div>
      </Container>
    </main>
  );
}
