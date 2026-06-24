"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const DEFAULT_MIN_LEFT_PERCENT = 28;
const DEFAULT_MAX_LEFT_PERCENT = 72;
const DEFAULT_KEYBOARD_STEP = 4;

type ResizableSplitPanelRenderState = {
  leftPercent: number;
  resizeHandle: React.ReactNode;
  resizing: boolean;
  rightPercent: number;
};

export function ResizableSplitPanel({
  children,
  className,
  closeThresholdPercent,
  defaultLeftPercent = 50,
  handleLabel = "Split-View-Breite anpassen",
  keyboardStep = DEFAULT_KEYBOARD_STEP,
  maxLeftPercent = DEFAULT_MAX_LEFT_PERCENT,
  minLeftPercent = DEFAULT_MIN_LEFT_PERCENT,
  onCollapseToLeft,
  onCollapseToRight,
  splitEnabled,
}: {
  children: (state: ResizableSplitPanelRenderState) => React.ReactNode;
  className?: string;
  closeThresholdPercent?: number;
  defaultLeftPercent?: number;
  handleLabel?: string;
  keyboardStep?: number;
  maxLeftPercent?: number;
  minLeftPercent?: number;
  onCollapseToLeft?: () => void;
  onCollapseToRight?: () => void;
  splitEnabled: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [leftPercent, setLeftPercent] = useState(defaultLeftPercent);
  const [resizing, setResizing] = useState(false);

  const clampLeftPercent = useCallback((value: number) =>
    Math.min(maxLeftPercent, Math.max(minLeftPercent, Math.round(value * 10) / 10)),
  [maxLeftPercent, minLeftPercent]);

  const resizeFromClientX = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect?.width) {
      return;
    }

    const nextPercent = ((clientX - rect.left) / rect.width) * 100;
    if (typeof closeThresholdPercent === "number") {
      if (nextPercent <= closeThresholdPercent && onCollapseToRight) {
        setResizing(false);
        onCollapseToRight();
        return;
      }
      if (nextPercent >= 100 - closeThresholdPercent && onCollapseToLeft) {
        setResizing(false);
        onCollapseToLeft();
        return;
      }
    }
    setLeftPercent(clampLeftPercent(nextPercent));
  }, [clampLeftPercent, closeThresholdPercent, onCollapseToLeft, onCollapseToRight]);

  useEffect(() => {
    if (!resizing) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      event.preventDefault();
      resizeFromClientX(event.clientX);
    };
    const stopResizing = () => setResizing(false);

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
    };
  }, [resizeFromClientX, resizing]);

  const rightPercent = 100 - leftPercent;
  const resizeHandle = splitEnabled ? (
    <ResizableSplitHandle
      keyboardStep={keyboardStep}
      label={handleLabel}
      maxLeftPercent={maxLeftPercent}
      minLeftPercent={minLeftPercent}
      onPointerDown={(event) => {
        event.preventDefault();
        resizeFromClientX(event.clientX);
        setResizing(true);
      }}
      onResizeBy={(delta) => setLeftPercent((current) => clampLeftPercent(current + delta))}
      onResizeTo={(value) => setLeftPercent(clampLeftPercent(value))}
      resizing={resizing}
    />
  ) : null;
  const style = useMemo(() => ({
    "--left-panel-width": `${leftPercent}%`,
    "--right-panel-width": `${rightPercent}%`,
  }) as React.CSSProperties, [leftPercent, rightPercent]);

  return (
    <div className={className} ref={containerRef} style={style}>
      {children({ leftPercent, resizeHandle, resizing, rightPercent })}
    </div>
  );
}

function ResizableSplitHandle({
  keyboardStep,
  label,
  maxLeftPercent,
  minLeftPercent,
  onPointerDown,
  onResizeBy,
  onResizeTo,
  resizing,
}: {
  keyboardStep: number;
  label: string;
  maxLeftPercent: number;
  minLeftPercent: number;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onResizeBy: (delta: number) => void;
  onResizeTo: (value: number) => void;
  resizing: boolean;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        "group absolute left-[var(--left-panel-width)] top-0 z-30 hidden h-full w-5 -translate-x-1/2 !cursor-col-resize touch-none md:block",
        resizing && "bg-foreground/[0.03]",
      )}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onResizeBy(-keyboardStep);
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          onResizeBy(keyboardStep);
        }
        if (event.key === "Home") {
          event.preventDefault();
          onResizeTo(minLeftPercent);
        }
        if (event.key === "End") {
          event.preventDefault();
          onResizeTo(maxLeftPercent);
        }
      }}
      onPointerDown={onPointerDown}
      type="button"
    >
      <span
        className={cn(
          "mx-auto block h-full w-px !cursor-col-resize bg-transparent transition-all",
          "group-hover:bg-gradient-to-b group-hover:from-transparent group-hover:via-border group-hover:to-transparent",
          "group-focus-visible:bg-gradient-to-b group-focus-visible:from-transparent group-focus-visible:via-border group-focus-visible:to-transparent",
          resizing && "bg-gradient-to-b from-transparent via-border to-transparent",
        )}
      />
      <span
        className={cn(
          "absolute left-1/2 top-1/2 h-12 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border/0 transition-colors",
          "group-hover:bg-border/80 group-focus-visible:bg-border/80",
          resizing && "bg-border",
        )}
      />
    </button>
  );
}
