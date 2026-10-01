import { describe, expect, it } from 'vitest';
import { openInkDb } from '../src/db/db';
import {
  createFolder,
  createNotebook,
  deleteFolder,
  folderContents,
  getNotebook,
  listFolders,
  listNotebooks,
  moveFolder,
  moveNotebook,
  putElements,
  renameFolder,
  renameNotebook,
} from '../src/db/repo';

let n = 0;
const open = () => openInkDb(`test-folders-${n++}`);

describe('資料夾與筆記本操作', () => {
  it('新增、重新命名、移動資料夾', async () => {
    const db = await open();
    const a = await createFolder(db, '學校', null);
    const b = await createFolder(db, '數學', a.id);
    expect(b.parentId).toBe(a.id);
    await renameFolder(db, b.id, '代數');
    await moveFolder(db, b.id, null);
    expect(await db.get('folders', b.id)).toMatchObject({ name: '代數', parentId: null });
    db.close();
  });

  it('不能把資料夾移到自己或子孫底下，資料不變', async () => {
    const db = await open();
    const a = await createFolder(db, 'a', null);
    const b = await createFolder(db, 'b', a.id);
    const c = await createFolder(db, 'c', b.id);
    await expect(moveFolder(db, a.id, a.id)).rejects.toThrow();
    await expect(moveFolder(db, a.id, c.id)).rejects.toThrow();
    expect((await db.get('folders', a.id))?.parentId).toBeNull();
    await moveFolder(db, c.id, a.id); // 往上移是允許的
    expect((await db.get('folders', c.id))?.parentId).toBe(a.id);
    db.close();
  });

  it('重新命名與移動筆記本，不改變 updatedAt', async () => {
    const db = await open();
    const f = await createFolder(db, 'f', null);
    const { notebook } = await createNotebook(db, { title: '舊名' });
    await renameNotebook(db, notebook.id, '新名');
    await moveNotebook(db, notebook.id, f.id);
    expect(await getNotebook(db, notebook.id)).toEqual({ ...notebook, title: '新名', folderId: f.id });
    db.close();
  });

  it('遞迴刪除資料夾與裡面的筆記本、頁面、element，不影響其他資料', async () => {
    const db = await open();
    const a = await createFolder(db, 'a', null);
    const b = await createFolder(db, 'b', a.id);
    const other = await createFolder(db, 'other', null);
    const inA = await createNotebook(db, { title: 'inA', folderId: a.id });
    const inB = await createNotebook(db, { title: 'inB', folderId: b.id });
    const inOther = await createNotebook(db, { title: 'inOther', folderId: other.id });
    const root = await createNotebook(db, { title: 'root' });
    const stroke = (pageId: string, id: string) => ({
      id,
      pageId,
      z: 0,
      type: 'stroke' as const,
      tool: 'pen' as const,
      color: '#000',
      width: 2,
      points: new Float32Array([1, 2, 0.5]),
    });
    await putElements(db, [stroke(inB.page.id, 'sb'), stroke(root.page.id, 'sr')]);

    expect(await folderContents(db, a.id)).toEqual({ folders: 2, notebooks: 2 });
    await deleteFolder(db, a.id);

    expect((await listFolders(db)).map((f) => f.name)).toEqual(['other']);
    expect((await listNotebooks(db)).map((x) => x.title).sort()).toEqual(['inOther', 'root']);
    expect(await db.get('pages', inA.page.id)).toBeUndefined();
    expect((await db.getAll('elements')).map((e) => e.id)).toEqual(['sr']);
    expect(await db.get('pages', inOther.page.id)).toBeDefined();
    db.close();
  });
});
