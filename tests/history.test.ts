import { describe, expect, it, vi } from 'vitest';
import { elementsCommand, History, type Command, type ElementStore } from '../src/editor/history';
import type { StrokeElement } from '../src/db/schema';

const log: string[] = [];
const cmd = (name: string): Command => ({
  pageId: `p-${name}`,
  undo: async () => void log.push(`undo ${name}`),
  redo: async () => void log.push(`redo ${name}`),
});

describe('History', () => {
  it('undo/redo 依序執行並回傳受影響的命令', async () => {
    log.length = 0;
    const h = new History();
    h.push(cmd('a'));
    h.push(cmd('b'));
    expect((await h.undo())?.pageId).toBe('p-b');
    expect((await h.undo())?.pageId).toBe('p-a');
    expect(await h.undo()).toBeUndefined();
    expect((await h.redo())?.pageId).toBe('p-a');
    expect(log).toEqual(['undo b', 'undo a', 'redo a']);
    expect(h.canUndo).toBe(true);
    expect(h.canRedo).toBe(true);
  });

  it('新動作會清空 redo', async () => {
    const h = new History();
    h.push(cmd('a'));
    await h.undo();
    expect(h.canRedo).toBe(true);
    h.push(cmd('b'));
    expect(h.canRedo).toBe(false);
  });

  it('上限 100 步，丟掉最舊的', async () => {
    const h = new History();
    for (let i = 0; i < 101; i++) h.push(cmd(String(i)));
    const undone: string[] = [];
    let c: Command | undefined;
    while ((c = await h.undo())) undone.push(c.pageId);
    expect(undone).toHaveLength(100);
    expect(undone.at(-1)).toBe('p-1');
  });

  it('連點 undo 時依序執行，不會同時進行', async () => {
    const h = new History();
    let running = 0;
    let maxRunning = 0;
    const slow = (name: string): Command => ({
      pageId: name,
      undo: async () => {
        maxRunning = Math.max(maxRunning, ++running);
        await new Promise((r) => setTimeout(r, 5));
        running--;
      },
      redo: async () => {},
    });
    h.push(slow('a'));
    h.push(slow('b'));
    const results = await Promise.all([h.undo(), h.undo()]);
    expect(results.map((r) => r?.pageId)).toEqual(['b', 'a']);
    expect(maxRunning).toBe(1);
  });

  it('execute 與 undo 依序執行：畫完立刻 undo 不會讓筆畫復活', async () => {
    const h = new History();
    const db = new Set<string>();
    const add: Command = {
      pageId: 'p',
      redo: async () => {
        await new Promise((r) => setTimeout(r, 10));
        db.add('s');
      },
      undo: async () => void db.delete('s'),
    };
    const exec = h.execute(add);
    const undo = h.undo();
    await Promise.all([exec, undo]);
    expect(db.has('s')).toBe(false);
    expect(h.canRedo).toBe(true);
  });

  it('執行失敗時命令留在原處，後續操作仍可進行', async () => {
    const h = new History();
    h.push({ pageId: 'x', undo: () => Promise.reject(new Error('db')), redo: async () => {} });
    await expect(h.undo()).rejects.toThrow('db');
    expect(h.canUndo).toBe(true);
    expect(h.canRedo).toBe(false);
    h.push(cmd('ok'));
    expect((await h.undo())?.pageId).toBe('p-ok');
  });
});

describe('elementsCommand', () => {
  const s = (id: string) => ({ id, pageId: 'p' }) as StrokeElement;

  it('畫一筆：undo 移除、redo 加回', async () => {
    const store: ElementStore = { add: vi.fn(async () => {}), remove: vi.fn(async () => {}) };
    const c = elementsCommand(store, 'p', [s('new')]);
    await c.undo();
    expect(store.remove).toHaveBeenCalledWith([s('new')]);
    await c.redo();
    expect(store.add).toHaveBeenCalledWith([s('new')]);
  });

  it('替換（局部擦除）：undo 還原成原本的一筆', async () => {
    const calls: string[] = [];
    const store: ElementStore = {
      add: async (els) => void calls.push(`add ${els.map((e) => e.id)}`),
      remove: async (els) => void calls.push(`remove ${els.map((e) => e.id)}`),
    };
    const c = elementsCommand(store, 'p', [s('a1'), s('a2')], [s('orig')]);
    await c.undo();
    await c.redo();
    expect(calls).toEqual(['remove a1,a2', 'add orig', 'remove orig', 'add a1,a2']);
  });

  it('修改（移動、改色）：同 id 直接覆寫，不先刪除', async () => {
    const calls: string[] = [];
    const store: ElementStore = {
      add: async (els) => void calls.push(`add ${els.map((e) => (e as { v?: number }).v)}`),
      remove: async (els) => void calls.push(`remove ${els.map((e) => e.id)}`),
    };
    const v = (n: number) => ({ id: 'x', pageId: 'p', v: n }) as unknown as StrokeElement;
    const c = elementsCommand(store, 'p', [v(2)], [v(1)]);
    await c.redo();
    await c.undo();
    expect(calls).toEqual(['add 2', 'add 1']);
  });
});
