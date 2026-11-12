import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeStack } from "../../hooks/useEscapeStack";

export interface RowMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  /** Linha separadora antes deste item. */
  divider?: boolean;
}

/** Menu de clique direito simples (mesmo visual do menu de servidor). */
export function RowMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: RowMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useEscapeStack(true, onClose);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pad = 8;
    const width = el.offsetWidth || 200;
    const height = el.offsetHeight || 160;
    setPos({
      left: Math.max(pad, Math.min(x, window.innerWidth - width - pad)),
      top: Math.max(pad, Math.min(y, window.innerHeight - height - pad)),
    });
  }, [x, y]);

  return createPortal(
    <div
      ref={ref}
      className="theme-modal-scope theme-panel theme-border fixed z-[80] bg-zinc-900/98 border border-zinc-700/60 rounded-xl shadow-2xl py-1 min-w-[190px] backdrop-blur-xl animate-scale-in"
      style={{ top: pos.top, left: pos.left }}
    >
      {items.map((item) => (
        <div key={item.label}>
          {item.divider ? <div className="h-px bg-zinc-800 my-0.5" /> : null}
          <button
            type="button"
            onClick={() => {
              item.onClick();
              onClose();
            }}
            className={`flex items-center w-full px-3 py-1.5 text-[12px] hover:bg-zinc-800 text-left ${
              item.danger ? "text-red-400" : "text-zinc-300"
            }`}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>,
    document.body
  );
}
