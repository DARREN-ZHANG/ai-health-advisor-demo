import { beforeEach, describe, expect, it } from 'vitest';
import {
  useBriefStreamStore,
  type BriefStreamEntry,
} from './brief-stream.store';

describe('briefStreamStore', () => {
  beforeEach(() => {
    // 每个用例前重置 store,避免用例间状态泄漏
    useBriefStreamStore.setState({ entries: {} });
  });

  it('begin 创建 entry,phase=streaming,draftSummary 为空字符串', () => {
    useBriefStreamStore.getState().begin('profile-a', 'req-1');

    const entry = useBriefStreamStore.getState().getEntry('profile-a');
    expect(entry).toEqual<BriefStreamEntry>({
      requestId: 'req-1',
      phase: 'streaming',
      draftSummary: '',
      draftActions: [],
      forecastStarted: false,
      draftFutureSuggestions: [],
    });
  });

  it('append 累积 delta 到 draftSummary', () => {
    const store = useBriefStreamStore.getState();
    store.begin('profile-a', 'req-1');
    store.append('profile-a', 'req-1', 'Hello');
    store.append('profile-a', 'req-1', ', ');

    const entry = useBriefStreamStore.getState().getEntry('profile-a');
    expect(entry?.draftSummary).toBe('Hello, ');
    expect(entry?.phase).toBe('streaming');
  });

  it('append 忽略 stale requestId(begin 请求 B 后,请求 A 的 delta 不生效)', () => {
    const store = useBriefStreamStore.getState();
    store.begin('profile-a', 'req-A');
    // 新请求覆盖旧请求
    store.begin('profile-a', 'req-B');
    store.append('profile-a', 'req-A', 'stale-delta');

    const entry = useBriefStreamStore.getState().getEntry('profile-a');
    expect(entry?.requestId).toBe('req-B');
    expect(entry?.draftSummary).toBe('');
  });

  it('append 对不存在的 profile 静默忽略(无 entry 无法追加)', () => {
    useBriefStreamStore.getState().append('profile-x', 'req-1', 'delta');

    expect(
      useBriefStreamStore.getState().getEntry('profile-x')
    ).toBeUndefined();
  });

  it('complete 清除临时条目', () => {
    const store = useBriefStreamStore.getState();
    store.begin('profile-a', 'req-1');
    store.append('profile-a', 'req-1', 'partial');

    useBriefStreamStore.getState().complete('profile-a', 'req-1');

    expect(
      useBriefStreamStore.getState().getEntry('profile-a')
    ).toBeUndefined();
  });

  it('complete 忽略 stale requestId', () => {
    const store = useBriefStreamStore.getState();
    store.begin('profile-a', 'req-A');
    store.begin('profile-a', 'req-B');

    // 旧请求的 complete 不应清掉当前 req-B 的 entry
    useBriefStreamStore.getState().complete('profile-a', 'req-A');

    const entry = useBriefStreamStore.getState().getEntry('profile-a');
    expect(entry?.requestId).toBe('req-B');
  });

  it('fail 清空 draft(entry 被清除)', () => {
    const store = useBriefStreamStore.getState();
    store.begin('profile-a', 'req-1');
    store.append('profile-a', 'req-1', 'partial-draft');

    useBriefStreamStore.getState().fail('profile-a', 'req-1');

    expect(
      useBriefStreamStore.getState().getEntry('profile-a')
    ).toBeUndefined();
  });

  it('fail 忽略 stale requestId', () => {
    const store = useBriefStreamStore.getState();
    store.begin('profile-a', 'req-A');
    store.append('profile-a', 'req-A', 'partial');
    store.begin('profile-a', 'req-B');

    // 旧请求的 fail 不应清掉新请求 req-B 的 entry
    useBriefStreamStore.getState().fail('profile-a', 'req-A');

    const entry = useBriefStreamStore.getState().getEntry('profile-a');
    expect(entry?.requestId).toBe('req-B');
    expect(entry?.draftSummary).toBe('');
  });

  it('getEntry 对未注册的 profile 返回 undefined', () => {
    expect(
      useBriefStreamStore.getState().getEntry('unknown')
    ).toBeUndefined();
  });

  it('多个 profile 并行维护各自 entry', () => {
    const store = useBriefStreamStore.getState();
    store.begin('profile-a', 'req-A');
    store.begin('profile-b', 'req-B');
    store.append('profile-a', 'req-A', 'AAA');
    store.append('profile-b', 'req-B', 'BBB');

    const a = useBriefStreamStore.getState().getEntry('profile-a');
    const b = useBriefStreamStore.getState().getEntry('profile-b');

    expect(a?.draftSummary).toBe('AAA');
    expect(b?.draftSummary).toBe('BBB');
  });
});
