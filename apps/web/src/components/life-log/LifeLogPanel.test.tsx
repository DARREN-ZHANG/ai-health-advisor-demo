import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { LifeLogPanel } from './LifeLogPanel';
import { LifeLogIntlProvider } from './intl-test-helper';
import { useProfileStore } from '@/stores/profile.store';
import { useLifeLogStore } from '@/stores/life-log.store';

function renderWithIntl(node: React.ReactNode) {
  return render(<LifeLogIntlProvider>{node}</LifeLogIntlProvider>);
}

function addDefaultEntry(index = 0) {
  const customAddButtons = screen.getAllByRole('button', { name: '自定义' });
  fireEvent.click(customAddButtons[index]!);
  fireEvent.click(screen.getAllByRole('button', { name: '添加' })[0]!);
}

/**
 * LifeLogPanel 集成测试：profile 隔离 + 增删改查 + 浮层交互。
 *
 * 不 mock store，直接驱动 zustand 内存状态，验证端到端数据流。
 */
describe('LifeLogPanel', () => {
  beforeEach(() => {
    // 重置 profile store
    useProfileStore.setState({
      currentProfileId: 'profile-a',
      currentProfile: null,
    });
    // 重置 life-log store
    useLifeLogStore.setState({ entriesByProfile: {} });
    // stub crypto.randomUUID，让 id 可预测
    let counter = 0;
    if (!globalThis.crypto) {
      vi.stubGlobal('crypto', {});
    }
    vi.stubGlobal('crypto', {
      ...globalThis.crypto,
      randomUUID: () => `id-${++counter}`,
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('渲染标题与"仅当前会话"标识', () => {
    renderWithIntl(<LifeLogPanel />);
    expect(screen.getByText('生活记录')).toBeTruthy();
    expect(screen.getByText('仅当前会话')).toBeTruthy();
  });

  it('渲染三个类目 section', () => {
    renderWithIntl(<LifeLogPanel />);
    expect(screen.getByText('咖啡因')).toBeTruthy();
    expect(screen.getByText('酒精')).toBeTruthy();
    expect(screen.getByText('饮水')).toBeTruthy();
  });

  it('通过自定义抽屉新增 1 杯 caffeine 出现在列表中', () => {
    renderWithIntl(<LifeLogPanel />);
    // 初始 0 杯
    expect(screen.getByText(/今日: 0 杯 \(0mg\)/)).toBeTruthy();
    addDefaultEntry(0);
    // 出现 1 杯 · 50mg 行
    expect(screen.getByText(/1杯 · 50mg/)).toBeTruthy();
    // 总和更新
    expect(screen.getByText(/今日: 1 杯 \(50mg\)/)).toBeTruthy();
  });

  it('自定义新增多次累计总和', () => {
    renderWithIntl(<LifeLogPanel />);
    // caffeine = 第一个
    addDefaultEntry(0);
    addDefaultEntry(0);
    addDefaultEntry(0);
    // 3 杯 = 150mg
    expect(screen.getByText(/今日: 3 杯 \(150mg\)/)).toBeTruthy();
  });

  it('hydration 自定义新增 1 杯 = 250ml', () => {
    renderWithIntl(<LifeLogPanel />);
    // hydration section 的快捷加（按类目顺序：第 3 个）
    addDefaultEntry(2);
    expect(screen.getByText(/今日: 1 杯 \(250ml\)/)).toBeTruthy();
    expect(screen.getByText(/1杯 · 250ml/)).toBeTruthy();
  });

  it('alcohol 自定义新增 1 杯 = 14g', () => {
    renderWithIntl(<LifeLogPanel />);
    addDefaultEntry(1);
    expect(screen.getByText(/今日: 1 杯 \(14g\)/)).toBeTruthy();
  });

  it('删除按钮从 store 移除条目', () => {
    renderWithIntl(<LifeLogPanel />);
    // 加 1 杯 caffeine
    addDefaultEntry(0);
    expect(screen.getByText(/1杯 · 50mg/)).toBeTruthy();
    // 删除
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    // 列表回到空态（三个类目都为空，出现 3 个空态文案）
    expect(screen.getAllByText('暂无记录').length).toBeGreaterThan(0);
    // caffeine 总量回到 0
    expect(screen.getAllByText(/今日: 0 杯 \(0mg\)/).length).toBeGreaterThan(0);
  });

  it('编辑现有条目：修改 cups 后保存', () => {
    renderWithIntl(<LifeLogPanel />);
    // 先快捷加 1 杯
    addDefaultEntry(0);
    expect(screen.getByText(/1杯 · 50mg/)).toBeTruthy();
    // 点击编辑
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    // 修改 cups 为 3
    const cupsInputs = screen.getAllByRole('spinbutton');
    fireEvent.change(cupsInputs[0]!, { target: { value: '3' } });
    // 保存
    fireEvent.click(screen.getAllByRole('button', { name: '保存' })[0]!);
    // 列表更新为 3 杯 · 150mg，原来的 1 杯 · 50mg 消失
    expect(screen.getByText(/3杯 · 150mg/)).toBeTruthy();
    expect(screen.queryByText(/1杯 · 50mg/)).toBeNull();
  });

  it('Profile 隔离：profile-a 的条目不出现在 profile-b', () => {
    renderWithIntl(<LifeLogPanel />);
    // 在 profile-a 下加 1 杯 caffeine
    addDefaultEntry(0);
    expect(screen.getByText(/1杯 · 50mg/)).toBeTruthy();
    expect(screen.getByText(/今日: 1 杯 \(50mg\)/)).toBeTruthy();

    // 切换到 profile-b
    act(() => {
      useProfileStore.setState({ currentProfileId: 'profile-b' });
    });
    // profile-b 没有条目，回到空态
    expect(screen.getAllByText('暂无记录').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/今日: 0 杯 \(0mg\)/).length).toBeGreaterThan(0);

    // profile-a 数据仍在 store 中（未清除）
    const aEntries = useLifeLogStore.getState().entriesByProfile['profile-a'];
    expect(aEntries).toBeDefined();
    expect(aEntries?.length).toBe(1);
  });

  it('切换 profile 后再切回，原条目仍在', () => {
    renderWithIntl(<LifeLogPanel />);
    addDefaultEntry(0);

    act(() => {
      useProfileStore.setState({ currentProfileId: 'profile-b' });
    });
    act(() => {
      useProfileStore.setState({ currentProfileId: 'profile-a' });
    });

    expect(screen.getByText(/1杯 · 50mg/)).toBeTruthy();
    expect(screen.getByText(/今日: 1 杯 \(50mg\)/)).toBeTruthy();
  });

  it('刷新模拟：重新 mount 后无数据（无 persist）', () => {
    const { unmount } = renderWithIntl(<LifeLogPanel />);
    addDefaultEntry(0);
    expect(screen.getByText(/1杯 · 50mg/)).toBeTruthy();

    // 模拟刷新：清空 store（zustand 内存被新页面会话重置）
    unmount();
    useLifeLogStore.setState({ entriesByProfile: {} });
    renderWithIntl(<LifeLogPanel />);

    // 重新挂载后回到空态
    expect(screen.getAllByText('暂无记录').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/今日: 0 杯 \(0mg\)/).length).toBeGreaterThan(0);
  });
});
