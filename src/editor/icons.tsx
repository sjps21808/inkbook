// 浮動快捷列的線條圖示（內嵌 SVG，不用外部套件）；顏色跟著文字顏色（currentColor）
import type { ComponentChildren } from 'preact';

const Icon = ({ children }: { children: ComponentChildren }) => (
  <svg
    viewBox="0 0 24 24"
    width="24"
    height="24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

/** 大選單開關：收起時 ▼（往下拉出）、展開時 ▲（往上收回），實心三角形 */
export const MenuToggleIcon = ({ open }: { open: boolean }) => (
  <Icon>
    <path
      data-dir={open ? 'up' : 'down'}
      d={open ? 'M6 15l6-7 6 7z' : 'M6 9l6 7 6-7z'}
      fill="currentColor"
      stroke-width="1"
    />
  </Icon>
);

export const PenIcon = () => (
  <Icon>
    <path d="M15.5 4.5l4 4L9 19l-5 1 1-5z" />
    <path d="M13.5 6.5l4 4" />
  </Icon>
);

export const HighlighterIcon = () => (
  <Icon>
    <path d="M14 4l6 6-7.5 7.5h-3L7 15v-3.5z" />
    <path d="M7 15l-3 3v2h5l1.5-2.5" />
  </Icon>
);

export const EraserIcon = () => (
  <Icon>
    <path d="M8.5 19.5L4 15a1.5 1.5 0 010-2.1L13 4a1.5 1.5 0 012.1 0L20 8.9a1.5 1.5 0 010 2.1l-8.5 8.5z" />
    <path d="M8.5 19.5H20M9 8.5l6.5 6.5" />
  </Icon>
);

export const LassoIcon = () => (
  <Icon>
    <path d="M12 5c4.4 0 8 2 8 5s-3.6 5-8 5-8-2-8-5 3.6-5 8-5z" stroke-dasharray="2.5 2.5" />
    <path d="M7 14c-1 2 0 4 2 4.5" />
  </Icon>
);

export const RectLassoIcon = () => (
  <Icon>
    <rect x="4" y="5" width="16" height="12" rx="1" stroke-dasharray="2.5 2.5" />
    <path d="M7 17c-1 2 0 3.5 2 4" />
  </Icon>
);

/** 分頁列右邊：回書架（簡易房屋） */
export const HomeIcon = () => (
  <Icon>
    <path d="M4 11l8-7 8 7" />
    <path d="M6 9.5V20h4.5v-5h3v5H18V9.5" />
  </Icon>
);

/** 有選項的工具選中時，圖示旁的小箭頭（再點一次跳出選單） */
export const ChevronIcon = () => (
  <svg
    class="chevron"
    viewBox="0 0 12 12"
    width="12"
    height="12"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M3 4.5l3 3 3-3" />
  </svg>
);

/** 粗細：一條橫線，線寬依段數 */
export const WidthIcon = ({ width }: { width: number }) => (
  <Icon>
    <path d="M5 12h14" stroke-width={width} />
  </Icon>
);

export const UndoIcon = () => (
  <Icon>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10a6 6 0 010 12h-3" />
  </Icon>
);

export const RedoIcon = () => (
  <Icon>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H10a6 6 0 000 12h3" />
  </Icon>
);

export const DuplicateIcon = () => (
  <Icon>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" />
  </Icon>
);

export const TrashIcon = () => (
  <Icon>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
  </Icon>
);
