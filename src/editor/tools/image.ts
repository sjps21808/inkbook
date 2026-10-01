import { newId } from '../../db/repo';
import { PAGE_HEIGHT, PAGE_WIDTH, type ImageElement } from '../../db/schema';
import type { ActionContext } from './types';

/** 匯入圖片的長邊上限（px）；超過就縮小再存 */
const MAX_IMAGE_PX = 2048;
/** 插入時最多佔頁面的比例 */
const MAX_PAGE_FRACTION = 0.6;

/** 長邊超過上限時縮小；回傳要存的 blob 與像素尺寸 */
async function prepare(file: Blob): Promise<{ data: Blob; w: number; h: number }> {
  const bmp = await createImageBitmap(file);
  const { width, height } = bmp;
  const k = MAX_IMAGE_PX / Math.max(width, height);
  if (k >= 1) {
    bmp.close();
    return { data: file, w: width, h: height };
  }
  const cv = document.createElement('canvas');
  cv.width = Math.round(width * k);
  cv.height = Math.round(height * k);
  cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height);
  bmp.close();
  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const data = await new Promise<Blob | null>((r) => cv.toBlob(r, type, 0.9));
  const result = { data: data!, w: cv.width, h: cv.height };
  cv.width = cv.height = 0;
  return result;
}

/** 存入圖片並放在頁面中央 */
export async function addImage(ctx: ActionContext, file: Blob): Promise<void> {
  const { data, w, h } = await prepare(file);
  const blobId = newId();
  await ctx.db.put('blobs', { id: blobId, data, mime: data.type || file.type });
  const k = Math.min((PAGE_WIDTH * MAX_PAGE_FRACTION) / w, (PAGE_HEIGHT * MAX_PAGE_FRACTION) / h, 1);
  const el: ImageElement = {
    id: newId(),
    pageId: ctx.pageId,
    z: ctx.nextZ,
    type: 'image',
    blobId,
    x: (PAGE_WIDTH - w * k) / 2,
    y: (PAGE_HEIGHT - h * k) / 2,
    w: w * k,
    h: h * k,
    rotation: 0,
  };
  ctx.insert([el]);
}

/** 開啟檔案選擇器（必須在點擊事件中呼叫） */
export function pickImage(ctx: ActionContext): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.hidden = true;
  const done = () => input.remove();
  input.addEventListener('cancel', done);
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    done();
    // 無痕模式的 IndexedDB 不能存 Blob
    if (file) addImage(ctx, file).catch(() => alert('無法儲存圖片'));
  });
  document.body.append(input);
  input.click();
}
