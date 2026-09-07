import { useEffect, useRef, useState, type ReactNode } from "react";

const MIN_OUTPUT = 120;
const MIN_EDITOR = 160;
const HANDLE_HEIGHT = 9;

export default function EditorSplit({ editor, output }: { editor: ReactNode; output: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; height: number } | null>(null);
  const [height, setHeight] = useState(200);
  const [minimum, setMinimum] = useState(MIN_OUTPUT);
  const [maximum, setMaximum] = useState(500);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      const min = Number(getComputedStyle(node).getPropertyValue("--min-output-height")) || MIN_OUTPUT;
      const max = Math.max(min, node.clientHeight - MIN_EDITOR - HANDLE_HEIGHT);
      setMinimum(min);
      setMaximum(max);
      setHeight((value) => Math.max(min, Math.min(max, value)));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function resize(value: number) {
    setHeight(Math.round(Math.max(minimum, Math.min(maximum, value))));
  }

  return (
    <div ref={container} className={`editor-split${dragging ? " is-resizing" : ""}`} style={{ gridTemplateRows: `minmax(${MIN_EDITOR}px, 1fr) ${HANDLE_HEIGHT}px ${height}px` }}>
      {editor}
      <div
        className="io-resizer"
        role="separator"
        tabIndex={0}
        aria-label="Resize input and output panel"
        aria-orientation="horizontal"
        aria-controls="editor-io"
        aria-valuemin={minimum}
        aria-valuemax={maximum}
        aria-valuenow={height}
        aria-valuetext={`${height} pixels`}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { y: event.clientY, height };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (drag.current) resize(drag.current.height + drag.current.y - event.clientY);
        }}
        onPointerUp={(event) => {
          drag.current = null;
          setDragging(false);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onLostPointerCapture={() => { drag.current = null; setDragging(false); }}
        onPointerCancel={() => { drag.current = null; setDragging(false); }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 50 : 20;
          if (event.key === "ArrowUp") resize(height + step);
          else if (event.key === "ArrowDown") resize(height - step);
          else if (event.key === "Home") resize(minimum);
          else if (event.key === "End") resize(maximum);
          else return;
          event.preventDefault();
        }}
      />
      {output}
    </div>
  );
}
