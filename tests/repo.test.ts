import { describe, expect, it } from 'vitest';
import { openInkDb } from '../src/db/db';
import {
  createNotebook,
  deleteElements,
  deleteNotebook,
  listElements,
  listNotebooks,
  listPages,
  putElements,
} from '../src/db/repo';
import type { StrokeElement } from '../src/db/schema';

let n = 0;
const open = () => openInkDb(`test-repo-${n++}`);

const stroke = (pageId: string, id: string, z: number): StrokeElement => ({
  id,
  pageId,
  z,
  type: 'stroke',
  tool: 'pen',
  color: '#1c1c1e',
  width: 3,
  points: new Float32Array([10, 20, 0.5, 30.25, 40.5, 0.7]),
});

describe('repo', () => {
  it('建立筆記本時同時建立第一頁', async () => {
    const db = await open();
    const { notebook, page } = await createNotebook(db, { title: '我的筆記' });
    expect(await listNotebooks(db)).toEqual([notebook]);
    expect(await listPages(db, notebook.id)).toEqual([page]);
    expect(page).toMatchObject({ notebookId: notebook.id, order: 0, template: 'blank' });
    db.close();
  });

  it('Float32Array 存入後讀回內容一致，並依 z 排序', async () => {
    const db = await open();
    const { page } = await createNotebook(db, { title: 'a' });
    const s2 = stroke(page.id, 's2', 2);
    const s1 = stroke(page.id, 's1', 1);
    await putElements(db, [s2, s1]);
    const els = (await listElements(db, page.id)) as StrokeElement[];
    expect(els.map((e) => e.id)).toEqual(['s1', 's2']);
    // fake-indexeddb 用 Node 的 structuredClone，讀回的物件屬於另一個 realm，instanceof 不可靠
    expect(Object.prototype.toString.call(els[0].points)).toBe('[object Float32Array]');
    expect(Array.from(els[0].points)).toEqual(Array.from(s1.points));
    db.close();
  });

  it('寫入與刪除 element 會更新筆記本的 updatedAt', async () => {
    const db = await open();
    const { notebook, page } = await createNotebook(db, { title: 'a' });
    const s = stroke(page.id, 's', 0);
    await new Promise((r) => setTimeout(r, 5));
    await putElements(db, [s]);
    const t1 = (await listNotebooks(db))[0].updatedAt;
    expect(t1).toBeGreaterThan(notebook.updatedAt);
    await new Promise((r) => setTimeout(r, 5));
    await deleteElements(db, [s]);
    expect(await listElements(db, page.id)).toEqual([]);
    expect((await listNotebooks(db))[0].updatedAt).toBeGreaterThan(t1);
    db.close();
  });

  it('刪除筆記本會連帶刪除頁面與 element，不影響其他筆記本', async () => {
    const db = await open();
    const a = await createNotebook(db, { title: 'a' });
    const b = await createNotebook(db, { title: 'b' });
    await putElements(db, [stroke(a.page.id, 'sa', 0), stroke(b.page.id, 'sb', 0)]);
    await deleteNotebook(db, a.notebook.id);
    expect((await listNotebooks(db)).map((x) => x.title)).toEqual(['b']);
    expect(await db.count('pages')).toBe(1);
    expect((await db.getAll('elements')).map((e) => e.id)).toEqual(['sb']);
    db.close();
  });
});
