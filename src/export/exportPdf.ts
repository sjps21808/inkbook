import { BlendMode, degrees, PDFDocument, rgb, type Color, type PDFImage, type PDFPage } from 'pdf-lib';
import type { InkDatabase } from '../db/db';
import { getBlob, listElements, listPages } from '../db/repo';
import { PAGE_HEIGHT, PAGE_WIDTH, type ImageElement, type Page, type PageElement, type StrokeElement, type Template } from '../db/schema';
import { HIGHLIGHTER_ALPHA, inkOrder, outlineToSvgPath, strokeOutline } from '../editor/stroke';
import { DOT_RADIUS, TEMPLATE_COLOR, TEMPLATE_LINE_WIDTH, templateShapes } from '../editor/templates';
import { pdfFit } from '../pdf/fit';

export interface ExportOptions {
  /** 每完成一頁呼叫一次 */
  onProgress?(done: number, total: number): void;
  /** 把 PNG/JPEG 以外的圖片轉成 PNG（預設用 canvas；測試可替換） */
  toPng?(data: Blob): Promise<Uint8Array>;
}

/** 用 canvas 把瀏覽器能解碼的圖片（webp、gif、heic…）轉成 PNG */
async function canvasToPng(data: Blob): Promise<Uint8Array> {
  const bmp = await createImageBitmap(data);
  const cv = document.createElement('canvas');
  cv.width = bmp.width;
  cv.height = bmp.height;
  cv.getContext('2d')!.drawImage(bmp, 0, 0);
  bmp.close();
  const png = await new Promise<Blob | null>((r) => cv.toBlob(r, 'image/png'));
  cv.width = cv.height = 0;
  return new Uint8Array(await png!.arrayBuffer());
}

const isPng = (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
const isJpeg = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

/** '#rrggbb' → pdf-lib 顏色 */
export function hexColor(hex: string): Color {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** pdf-lib 的 drawSvgPath 以 (x, y) 為原點、y 軸朝下，放在頁面左上角就和 canvas 座標一致 */
const TOP_LEFT = { x: 0, y: PAGE_HEIGHT };

function drawTemplate(page: PDFPage, t: Template): void {
  const { lines, dots } = templateShapes(t);
  const color = hexColor(TEMPLATE_COLOR);
  if (lines.length) {
    const d = lines.map(([x1, y1, x2, y2]) => `M${x1} ${y1}L${x2} ${y2}`).join('');
    page.drawSvgPath(d, { ...TOP_LEFT, borderColor: color, borderWidth: TEMPLATE_LINE_WIDTH });
  }
  if (dots.length) {
    const r = DOT_RADIUS;
    const d = dots.map(([x, y]) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`).join('');
    page.drawSvgPath(d, { ...TOP_LEFT, color });
  }
}

/**
 * 把匯入的 PDF 頁以 Form XObject 放到 A4 頁上，位置與畫面相同（pdfFit）。
 * 和 pdf.js 一樣以 CropBox 為範圍並套用 /Rotate；底下先塗白（pdf.js 渲染時也會塗白）。
 */
async function drawPdfPage(doc: PDFDocument, page: PDFPage, src: PDFDocument, ref: NonNullable<Page['pdf']>) {
  const srcPage = src.getPage(ref.pageNo - 1);
  const box = pdfFit(ref.srcWidth, ref.srcHeight);
  page.drawRectangle({ x: box.x, y: PAGE_HEIGHT - box.y - box.h, width: box.w, height: box.h, color: rgb(1, 1, 1) });
  // 沒有 Contents 的空白頁不能嵌入（pdf-lib 會丟錯），只留白紙
  if (!srcPage.node.Contents()) return;
  const crop = srcPage.getCropBox();
  const embedded = await doc.embedPage(srcPage, {
    left: crop.x,
    bottom: crop.y,
    right: crop.x + crop.width,
    top: crop.y + crop.height,
  });
  const pl = pdfPlacement(ref, crop, srcPage.getRotation().angle);
  page.drawPage(embedded, { ...pl, rotate: degrees(pl.rotate) });
}

export interface Placement {
  /** 旋轉軸（PDF 座標，原點在左下） */
  x: number;
  y: number;
  width: number;
  height: number;
  /** 逆時針角度 */
  rotate: number;
}

/**
 * 嵌入頁（未旋轉、大小 crop）在 A4 頁上的位置，結果要剛好蓋住 pdfFit 的範圍。
 * /Rotate 是順時針；drawPage 以 (x, y) 為軸逆時針旋轉，所以轉負角度並把軸移到對應的角。
 */
export function pdfPlacement(ref: NonNullable<Page['pdf']>, crop: { width: number; height: number }, rotation: number): Placement {
  const box = pdfFit(ref.srcWidth, ref.srcHeight);
  const k = box.w / ref.srcWidth;
  const left = box.x;
  const bottom = PAGE_HEIGHT - box.y - box.h;
  const rot = (((rotation % 360) + 360) % 360) as 0 | 90 | 180 | 270;
  const anchor = {
    0: { x: left, y: bottom },
    90: { x: left, y: bottom + box.h },
    180: { x: left + box.w, y: bottom + box.h },
    270: { x: left + box.w, y: bottom },
  }[rot];
  return { ...anchor, width: crop.width * k, height: crop.height * k, rotate: -rot };
}

function drawStroke(page: PDFPage, s: StrokeElement): void {
  const d = outlineToSvgPath(strokeOutline(s.points, s.width));
  if (!d) return;
  const hl = s.tool === 'highlighter';
  page.drawSvgPath(d, {
    ...TOP_LEFT,
    color: hexColor(s.color),
    opacity: hl ? HIGHLIGHTER_ALPHA : 1,
    blendMode: hl ? BlendMode.Multiply : BlendMode.Normal,
  });
}

/** 圖片依位置與大小放置；rotation 目前一律為 0，畫面也不使用，所以這裡同樣忽略 */
function drawImage(page: PDFPage, e: ImageElement, img: PDFImage): void {
  page.drawImage(img, { x: e.x, y: PAGE_HEIGHT - e.y - e.h, width: e.w, height: e.h });
}

type ImageLoader = (blobId: string) => Promise<PDFImage | undefined>;

async function drawElements(page: PDFPage, els: PageElement[], image: ImageLoader): Promise<void> {
  for (const e of inkOrder(els)) {
    if (e.type === 'stroke') drawStroke(page, e);
    else {
      const img = await image(e.blobId);
      if (img) drawImage(page, e, img);
    }
  }
}

/** 把整本筆記本匯出成 PDF（每頁 A4，向量輸出） */
export async function exportNotebookPdf(db: InkDatabase, notebookId: string, opts: ExportOptions = {}): Promise<Uint8Array> {
  const pages = await listPages(db, notebookId);
  const doc = await PDFDocument.create();
  // 每個 PDF blob 只解析一次
  const sources = new Map<string, Promise<PDFDocument>>();
  const source = (blobId: string) => {
    let src = sources.get(blobId);
    if (!src) {
      src = getBlob(db, blobId).then(async (rec) =>
        PDFDocument.load(await rec!.data.arrayBuffer(), { ignoreEncryption: true, updateMetadata: false }),
      );
      sources.set(blobId, src);
    }
    return src;
  };
  // 同一張圖片只嵌入一次；找不到 blob 或無法解碼時略過（和畫面一樣不畫）
  const images = new Map<string, Promise<PDFImage | undefined>>();
  const image: ImageLoader = (blobId) => {
    let img = images.get(blobId);
    if (!img) {
      img = getBlob(db, blobId).then(async (rec) => {
        if (!rec) return undefined;
        const bytes = new Uint8Array(await rec.data.arrayBuffer());
        if (isPng(bytes)) return doc.embedPng(bytes);
        if (isJpeg(bytes)) return doc.embedJpg(bytes);
        return doc.embedPng(await (opts.toPng ?? canvasToPng)(rec.data));
      }).catch(() => undefined); // 無法解碼的圖片畫面上也不會顯示
      images.set(blobId, img);
    }
    return img;
  };
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawTemplate(page, p.template);
    if (p.pdf) await drawPdfPage(doc, page, await source(p.pdf.blobId), p.pdf);
    await drawElements(page, await listElements(db, p.id), image);
    opts.onProgress?.(i + 1, pages.length);
  }
  return doc.save();
}
