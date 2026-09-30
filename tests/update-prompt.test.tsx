import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';

const state = vi.hoisted(() => ({
  needRefresh: false,
  updateServiceWorker: vi.fn(async (_reload?: boolean) => {}),
}));

vi.mock('virtual:pwa-register/preact', () => ({
  useRegisterSW: () => ({
    needRefresh: [state.needRefresh, () => {}],
    offlineReady: [false, () => {}],
    updateServiceWorker: state.updateServiceWorker,
  }),
}));

import { UpdatePrompt } from '../src/pwa/UpdatePrompt';

describe('UpdatePrompt', () => {
  let root: HTMLDivElement;
  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
    state.updateServiceWorker.mockClear();
  });
  afterEach(() => {
    render(null, root);
    root.remove();
  });

  it('沒有新版時不顯示', () => {
    state.needRefresh = false;
    act(() => render(<UpdatePrompt />, root));
    expect(root.textContent).toBe('');
  });

  it('有新版時顯示「有新版本」，但不會自動套用', () => {
    state.needRefresh = true;
    act(() => render(<UpdatePrompt />, root));
    expect(root.querySelector('button')?.textContent).toBe('有新版本');
    expect(state.updateServiceWorker).not.toHaveBeenCalled();
  });

  it('點擊後才套用更新', () => {
    state.needRefresh = true;
    act(() => render(<UpdatePrompt />, root));
    act(() => root.querySelector('button')!.click());
    expect(state.updateServiceWorker).toHaveBeenCalledWith(true);
  });
});
