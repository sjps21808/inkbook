import { useState } from 'preact/hooks';
import type { Template } from '../db/schema';
import { TEMPLATES } from './templates';

interface Props {
  defaultTemplate: Template;
  canDelete: boolean;
  /** 目前頁的 index（開啟選單時讀取） */
  currentIndex(): number;
  onAdd(afterIndex: number, template: Template): void;
  onDelete(index: number): void;
}

type Open = { kind: 'add'; index: number } | { kind: 'delete'; index: number } | null;

export function PageActions({ defaultTemplate, canDelete, currentIndex, onAdd, onDelete }: Props) {
  const [open, setOpen] = useState<Open>(null);
  const toggle = (kind: 'add' | 'delete') =>
    setOpen((o) => (o?.kind === kind ? null : { kind, index: currentIndex() }));

  return (
    <div class="group page-actions">
      <button aria-expanded={open?.kind === 'add'} onClick={() => toggle('add')}>
        新增頁面
      </button>
      <button disabled={!canDelete} aria-expanded={open?.kind === 'delete'} onClick={() => toggle('delete')}>
        刪除頁面
      </button>
      {open?.kind === 'add' && (
        <div class="popover" role="menu" aria-label="選擇模板">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              role="menuitem"
              aria-current={t.id === defaultTemplate}
              onClick={() => {
                setOpen(null);
                onAdd(open.index, t.id);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      {open?.kind === 'delete' && (
        <div class="popover" role="alertdialog" aria-label="確認刪除頁面">
          <span>刪除第 {open.index + 1} 頁？</span>
          <button
            class="danger"
            onClick={() => {
              setOpen(null);
              onDelete(open.index);
            }}
          >
            刪除
          </button>
          <button onClick={() => setOpen(null)}>取消</button>
        </div>
      )}
    </div>
  );
}
