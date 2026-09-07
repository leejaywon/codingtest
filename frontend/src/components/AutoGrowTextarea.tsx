import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string };

function fitContent(node: HTMLTextAreaElement) {
  if (!node.getClientRects().length) return;
  const style = getComputedStyle(node);
  const border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
  node.style.height = "0px";
  node.style.height = `${node.scrollHeight + border}px`;
}

export default function AutoGrowTextarea({ value, ...props }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (ref.current) fitContent(ref.current);
  }, [value]);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    let lastWidth = -1;
    const observer = new ResizeObserver(() => {
      // Refit wrapped lines when the viewport changes or the code pane opens.
      // Ignore height changes caused by fitting the content itself.
      if (node.clientWidth === lastWidth) return;
      lastWidth = node.clientWidth;
      fitContent(node);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return <textarea {...props} ref={ref} value={value} rows={2} />;
}
