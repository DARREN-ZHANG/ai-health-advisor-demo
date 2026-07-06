import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFocusTrap } from './useFocusTrap';

/**
 * useFocusTrap 单元测试。
 *
 * 重点验证可聚焦元素过滤逻辑：
 * - `visibility: hidden` 被跳过。
 * - `[inert]` 子树被跳过。
 *
 * 注意：jsdom 不能真实模拟 Tab 默认行为，因此只验证选择器 + 过滤
 * 的副作用（被聚焦的元素是第一个有效元素）。
 */
describe('useFocusTrap', () => {
  beforeEach(() => {
    // jsdom 默认 activeElement 为 body
    (document.activeElement as HTMLElement | null)?.blur?.();
  });

  it('active=false 时不绑定 keydown（按 Escape 不触发 onEscape）', () => {
    const onEscape = vi.fn();
    const div = document.createElement('div');
    document.body.appendChild(div);

    renderHook(() =>
      useFocusTrap({ active: false, containerRef: { current: div }, onEscape }),
    );

    div.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(onEscape).not.toHaveBeenCalled();

    div.remove();
  });

  it('active=true 时 Escape 触发 onEscape 并 stopPropagation', () => {
    const onEscape = vi.fn();
    const div = document.createElement('div');
    document.body.appendChild(div);

    renderHook(() =>
      useFocusTrap({ active: true, containerRef: { current: div }, onEscape }),
    );

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    const spy = vi.spyOn(event, 'stopPropagation');
    div.dispatchEvent(event);
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalled();

    div.remove();
  });

  it('选择器跳过 [inert] 与 [inert] 子树内的按钮', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    div.innerHTML = `
      <button id="ok">OK</button>
      <div inert>
        <button id="inert-child">不可达</button>
      </div>
      <button id="inert-self" inert>自身 inert</button>
    `;

    const okBtn = div.querySelector('#ok') as HTMLButtonElement;
    const inertChild = div.querySelector('#inert-child') as HTMLButtonElement;
    const inertSelf = div.querySelector('#inert-self') as HTMLButtonElement;

    // jsdom 的 offsetParent 通常为 null。让 #ok 作为 activeElement，使其
    // 通过 `=== document.activeElement` 兜底。
    const activeElementSpy = vi
      .spyOn(document, 'activeElement', 'get')
      .mockReturnValue(okBtn);

    renderHook(() =>
      useFocusTrap({ active: true, containerRef: { current: div } }),
    );

    const focusSpy = vi.spyOn(okBtn, 'focus');
    const inertChildFocusSpy = vi.spyOn(inertChild, 'focus');
    const inertSelfFocusSpy = vi.spyOn(inertSelf, 'focus');

    // 焦点在 #ok（first === last）→ Shift+Tab 触发 focus last（#ok）。
    // inert 元素被选择器排除，永远拿不到焦点。
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
    });
    div.dispatchEvent(event);

    expect(inertChildFocusSpy).not.toHaveBeenCalled();
    expect(inertSelfFocusSpy).not.toHaveBeenCalled();
    expect(focusSpy).toHaveBeenCalled();

    activeElementSpy.mockRestore();
    div.remove();
  });

  it('过滤逻辑跳过 visibility:hidden 的按钮', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    div.innerHTML = `
      <button id="hidden-btn">隐藏</button>
      <button id="visible-btn">可见</button>
    `;

    const hiddenBtn = div.querySelector('#hidden-btn') as HTMLButtonElement;
    const visibleBtn = div.querySelector('#visible-btn') as HTMLButtonElement;

    // jsdom 对 offsetParent 支持有限（多为 null）。把 visible 当作
    // activeElement，触发 `=== document.activeElement` 兜底通过 display 检查。
    const activeElementSpy = vi
      .spyOn(document, 'activeElement', 'get')
      .mockReturnValue(visibleBtn);

    // mock getComputedStyle：hidden 按钮 visibility:hidden
    const gcs = vi.spyOn(window, 'getComputedStyle');
    gcs.mockImplementation((el: Element) => {
      const isHidden = el === hiddenBtn;
      return {
        visibility: isHidden ? 'hidden' : 'visible',
      } as CSSStyleDeclaration;
    });

    const visibleFocusSpy = vi.spyOn(visibleBtn, 'focus');
    const hiddenFocusSpy = vi.spyOn(hiddenBtn, 'focus');

    renderHook(() =>
      useFocusTrap({ active: true, containerRef: { current: div } }),
    );

    // 焦点在 visible（被识别为 last），按普通 Tab → 应循环到 first。
    // hidden 被过滤，first === last === visible。
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
    });
    div.dispatchEvent(event);

    expect(hiddenFocusSpy).not.toHaveBeenCalled();
    expect(visibleFocusSpy).toHaveBeenCalled();

    activeElementSpy.mockRestore();
    gcs.mockRestore();
    div.remove();
  });
});
