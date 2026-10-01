import type { InkDatabase } from '../db/db';

/** 同時保留的解碼圖片上限（4GB RAM iPad 的記憶體考量） */
const MAX_BITMAPS = 24;

/** 依 blobId 解碼圖片並快取（超過上限時釋放最久沒用的） */
export class ImageCache {
  private readonly ready = new Map<string, ImageBitmap>();
  private readonly loading = new Map<string, Promise<ImageBitmap>>();

  constructor(private readonly db: InkDatabase) {}

  /** 已解碼就回傳，否則 undefined */
  peek(blobId: string): ImageBitmap | undefined {
    const bmp = this.ready.get(blobId);
    if (bmp) {
      // 重新插入 = 標記為最近使用
      this.ready.delete(blobId);
      this.ready.set(blobId, bmp);
    }
    return bmp;
  }

  load(blobId: string): Promise<ImageBitmap> {
    const bmp = this.peek(blobId);
    if (bmp) return Promise.resolve(bmp);
    let p = this.loading.get(blobId);
    if (!p) {
      p = this.db
        .get('blobs', blobId)
        .then((rec) => {
          if (!rec) throw new Error(`找不到圖片 ${blobId}`);
          return createImageBitmap(rec.data);
        })
        .then((bmp) => {
          this.ready.set(blobId, bmp);
          this.evict();
          return bmp;
        })
        .finally(() => this.loading.delete(blobId));
      this.loading.set(blobId, p);
    }
    return p;
  }

  private evict() {
    for (const [id, bmp] of this.ready) {
      if (this.ready.size <= MAX_BITMAPS) break;
      this.ready.delete(id);
      bmp.close();
    }
  }
}
