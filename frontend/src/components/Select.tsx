import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

export type SelectOption = { value: string; label: string };

export default function Select({
  value,
  onChange,
  options,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState({ top: 0, left: 0, width: 0, maxHeight: 280 });
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value);

  function place() {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(Math.max(r.width, 220), window.innerWidth - 16);
    const left = Math.min(r.left, window.innerWidth - width - 8);
    const spaceBelow = window.innerHeight - r.bottom - 10;
    const spaceAbove = r.top - 10;
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
    const maxHeight = Math.min(280, Math.max(0, openUp ? spaceAbove : spaceBelow));
    setMenu({
      top: openUp ? Math.max(8, r.top - maxHeight - 4) : r.bottom + 4,
      left: Math.max(8, left),
      width,
      maxHeight,
    });
  }

  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open]);

  useEffect(() => {
    function onDoc(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        setOpen(false);
        btnRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onMove() {
      place();
    }
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open]);

  return (
    <div className={`ck-select${open ? " open" : ""}${className ? ` ${className}` : ""}`} ref={rootRef}>
      <button
        ref={btnRef}
        type="button"
        className="ck-select-btn"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="ck-select-value">{selected?.label ?? value}</span>
        <span className="ck-select-caret" aria-hidden="true">
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open ? (
        <ul
          className="ck-select-menu"
          role="listbox"
          id={listId}
          style={{ top: menu.top, left: menu.left, width: menu.width, maxHeight: menu.maxHeight }}
        >
          {options.map((o) => {
            const on = o.value === value;
            return (
              <li key={o.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  className={on ? "on" : undefined}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                    btnRef.current?.focus();
                  }}
                >
                  <span className="ck-select-mark">{on ? "▶" : ""}</span>
                  {o.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
