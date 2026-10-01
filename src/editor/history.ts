import type { PageElement } from '../db/schema';

export interface Command {
  /** 受影響的頁面（M3：undo/redo 時捲到這一頁） */
  pageId: string;
  undo(): Promise<void>;
  redo(): Promise<void>;
}

/** 整本筆記共用的 undo/redo 紀錄；只存在記憶體，不寫進資料庫 */
export class History {
  private done: Command[] = [];
  private undone: Command[] = [];
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly limit = 100) {}

  /** 記錄一個「已經執行過」的動作 */
  push(cmd: Command): void {
    this.done.push(cmd);
    if (this.done.length > this.limit) this.done.shift();
    this.undone = [];
  }

  get canUndo(): boolean {
    return this.done.length > 0;
  }

  get canRedo(): boolean {
    return this.undone.length > 0;
  }

  undo(): Promise<Command | undefined> {
    return this.run(this.done, this.undone, (c) => c.undo());
  }

  redo(): Promise<Command | undefined> {
    return this.run(this.undone, this.done, (c) => c.redo());
  }

  // 連點時依序執行，避免兩次 undo 同時寫入資料庫
  private run(from: Command[], to: Command[], exec: (c: Command) => Promise<void>) {
    const next = this.queue.then(async () => {
      const cmd = from.pop();
      if (!cmd) return undefined;
      try {
        await exec(cmd);
      } catch (e) {
        from.push(cmd);
        throw e;
      }
      to.push(cmd);
      return cmd;
    });
    this.queue = next.catch(() => {});
    return next;
  }
}

export interface ElementStore {
  add(els: PageElement[]): Promise<void>;
  remove(els: PageElement[]): Promise<void>;
}

/** 新增／移除 element 的動作（畫一筆 = added；M6 局部擦除 = removed 原筆 + added 碎片） */
export function elementsCommand(
  store: ElementStore,
  pageId: string,
  added: PageElement[],
  removed: PageElement[] = [],
): Command {
  return {
    pageId,
    async undo() {
      if (added.length) await store.remove(added);
      if (removed.length) await store.add(removed);
    },
    async redo() {
      if (removed.length) await store.remove(removed);
      if (added.length) await store.add(added);
    },
  };
}
