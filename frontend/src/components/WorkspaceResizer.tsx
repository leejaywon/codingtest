import { useEffect, useRef, useState } from "react";

const MIN_PROBLEM = 300;
const MIN_EDITOR = 420;
const DEFAULT_PROBLEM_RATIO = 0.44;

export default function WorkspaceResizer() {
  const handleRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const ratio = useRef(DEFAULT_PROBLEM_RATIO);
  const bounds = useRef({ minimum: MIN_PROBLEM, maximum: MIN_PROBLEM });
  const [width, setWidth] = useState(MIN_PROBLEM);
  const [maximum, setMaximum] = useState(MIN_PROBLEM);
  const [dragging, setDragging] = useState(false);

  function resize(value: number, updateRatio = true) {
    const handle = handleRef.current;
    const container = handle?.parentElement;
    if (!container || !handle) return;

    const next = Math.round(Math.max(bounds.current.minimum, Math.min(bounds.current.maximum, value)));
    container.style.setProperty("--problem-pane-width", `${next}px`);
    setWidth(next);

    if (updateRatio) {
      const available = Math.max(1, container.clientWidth - handle.offsetWidth);
      ratio.current = next / available;
    }
  }

  useEffect(() => {
    const handle = handleRef.current;
    const container = handle?.parentElement;
    if (!handle || !container) return;

    const observer = new ResizeObserver(() => {
      if (getComputedStyle(handle).display === "none") return;

      const available = Math.max(0, container.clientWidth - handle.offsetWidth);
      const nextMaximum = Math.max(MIN_PROBLEM, available - MIN_EDITOR);
      bounds.current = { minimum: MIN_PROBLEM, maximum: nextMaximum };
      setMaximum(nextMaximum);
      resize(available * ratio.current, false);
    });

    observer.observe(container);
    return () => {
      observer.disconnect();
      container.style.removeProperty("--problem-pane-width");
      container.classList.remove("workspace-is-resizing");
    };
  }, []);

  function stopDragging() {
    drag.current = null;
    setDragging(false);
    handleRef.current?.parentElement?.classList.remove("workspace-is-resizing");
  }

  return (
    <div
      ref={handleRef}
      className={`workspace-resizer${dragging ? " is-active" : ""}`}
      role="separator"
      tabIndex={0}
      aria-label="Resize problem and code panels"
      aria-orientation="vertical"
      aria-controls="problem-statement code-workspace"
      aria-valuemin={MIN_PROBLEM}
      aria-valuemax={maximum}
      aria-valuenow={width}
      aria-valuetext={`${width} pixels for the problem panel`}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        const problemPane = event.currentTarget.previousElementSibling;
        drag.current = {
          x: event.clientX,
          width: problemPane?.getBoundingClientRect().width || width,
        };
        event.currentTarget.parentElement?.classList.add("workspace-is-resizing");
        setDragging(true);
      }}
      onPointerMove={(event) => {
        if (drag.current) resize(drag.current.width + event.clientX - drag.current.x);
      }}
      onPointerUp={(event) => {
        stopDragging();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onLostPointerCapture={stopDragging}
      onPointerCancel={stopDragging}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 50 : 20;
        if (event.key === "ArrowLeft") resize(width - step);
        else if (event.key === "ArrowRight") resize(width + step);
        else if (event.key === "Home") resize(MIN_PROBLEM);
        else if (event.key === "End") resize(maximum);
        else return;
        event.preventDefault();
      }}
    />
  );
}
