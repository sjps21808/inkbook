import { describe, expect, it } from 'vitest';
import { openInkDb } from '../src/db/db';
import {
  addPage,
  createNotebook,
  deletePage,
  getNotebook,
  listElements,
  listPages,
  putElements,
  reorderPages,
  restorePage,
} from '../src/db/repo';
import type { StrokeElement } from '../src/db/schema';

let n = 0;
const setup = async () => {
  const db = await openInkDb(`test-pages-${n++}`);
  const { notebook, page } = await createNotebook(db, { title: 'nb', template: 'lined' });
  return { db, notebook, first: page };
};
const orders = async (db: Awaited<ReturnType<typeof setup>>['db'], nbId: string) =>
  (await listPages(db, nbId)).map((p) => [p.id, p.order]);

const stroke = (pageId: string, id: string): StrokeElement => ({
  id, pageId, z: 0, type: 'stroke', tool: 'pen', color: '#000', width: 3, points: new Float32Array([1, 2, 0.5]),
});

describe('頁面操作', () => {
  it('在指定位置插入，order 保持連續', async () => {
    const { db, notebook, first } = await setup();
    const last = await addPage(db, notebook.id, 1, 'grid');
    const mid = await addPage(db, notebook.id, 1, 'dot');
    expect(mid.order).toBe(1);
    expect(await orders(db, notebook.id)).toEqual([
      [first.id, 0],
      [mid.id, 1],
      [last.id, 2],
    ]);
    expect((await listPages(db, notebook.id)).map((p) => p.template)).toEqual(['lined', 'dot', 'grid']);
    db.close();
  });

  it('刪除後還原，頁面、位置與 element 完全一致', async () => {
    const { db, notebook, first } = await setup();
    const p1 = await addPage(db, notebook.id, 1, 'blank');
    const p2 = await addPage(db, notebook.id, 2, 'blank');
    await putElements(db, [stroke(p1.id, 'a'), stroke(p1.id, 'b')]);
    const before = await listPages(db, notebook.id);

    const snap = await deletePage(db, p1.id);
    expect(snap.elements.map((e) => e.id).sort()).toEqual(['a', 'b']);
    expect(await orders(db, notebook.id)).toEqual([
      [first.id, 0],
      [p2.id, 1],
    ]);
    expect(await listElements(db, p1.id)).toEqual([]);

    await restorePage(db, snap);
    expect(await listPages(db, notebook.id)).toEqual(before);
    expect((await listElements(db, p1.id)).map((e) => e.id).sort()).toEqual(['a', 'b']);
    db.close();
  });

  it('重新排序', async () => {
    const { db, notebook, first } = await setup();
    const p1 = await addPage(db, notebook.id, 1, 'blank');
    const p2 = await addPage(db, notebook.id, 2, 'blank');
    await reorderPages(db, notebook.id, [p2.id, first.id, p1.id]);
    expect(await orders(db, notebook.id)).toEqual([
      [p2.id, 0],
      [first.id, 1],
      [p1.id, 2],
    ]);
    db.close();
  });

  it('頁面操作會更新筆記本的 updatedAt', async () => {
    const { db, notebook } = await setup();
    await new Promise((r) => setTimeout(r, 5));
    await addPage(db, notebook.id, 1, 'blank');
    expect((await getNotebook(db, notebook.id))!.updatedAt).toBeGreaterThan(notebook.updatedAt);
    db.close();
  });
});
