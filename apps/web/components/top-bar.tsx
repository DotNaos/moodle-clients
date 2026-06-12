"use client";

import { ArrowLeft, ArrowRight, ChevronRight, Home, Menu } from "lucide-react";
import type { ReactNode } from "react";

import type { NavigatorBreadcrumb, NavigatorState } from "@/lib/navigator";
import { cn } from "@/lib/utils";

const ICON_BUTTON_CLASS =
  "grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-muted-foreground";

// Single top row: burger (split layout only) · breadcrumbs · back/forward · actions.
export function TopBar({
  actions,
  breadcrumbs,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onNavigate,
  onToggleSidebar,
  showSidebarToggle,
}: {
  actions?: ReactNode;
  breadcrumbs: NavigatorBreadcrumb[];
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onNavigate: (state: NavigatorState) => void;
  onToggleSidebar?: () => void;
  showSidebarToggle: boolean;
}) {
  return (
    <header className="flex h-12 w-full min-w-0 shrink-0 items-center gap-1 border-b border-border px-2 md:px-3">
      {showSidebarToggle && onToggleSidebar ? (
        <button
          aria-label="Sidebar ein-/ausblenden"
          className={ICON_BUTTON_CLASS}
          onClick={onToggleSidebar}
          type="button"
        >
          <Menu aria-hidden className="size-5" />
        </button>
      ) : null}

      <div className="flex shrink-0 items-center gap-0.5">
        <button
          aria-label="Zurück"
          className={ICON_BUTTON_CLASS}
          disabled={!canGoBack}
          onClick={onBack}
          type="button"
        >
          <ArrowLeft aria-hidden className="size-4" />
        </button>
        <button
          aria-label="Vorwärts"
          className={ICON_BUTTON_CLASS}
          disabled={!canGoForward}
          onClick={onForward}
          type="button"
        >
          <ArrowRight aria-hidden className="size-4" />
        </button>
      </div>

      <button
        aria-label="Home"
        className={ICON_BUTTON_CLASS}
        onClick={() => onNavigate(breadcrumbs[0]?.target ?? { path: { kind: "home" }, document: null })}
        type="button"
      >
        <Home aria-hidden className="size-4" />
      </button>

      <nav aria-label="Navigationspfad" className="ml-1 flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
        {breadcrumbs.slice(1).map((crumb, index) => {
          const isCurrent = index === breadcrumbs.length - 2;
          return (
            <span className={cn("flex items-center gap-0.5", isCurrent ? "min-w-0" : "shrink-0")} key={crumb.id}>
              {index > 0 ? (
                <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground/60" />
              ) : null}
              {isCurrent ? (
                <span aria-current="page" className="truncate px-2 py-1 text-sm font-medium text-foreground">
                  {crumb.label}
                </span>
              ) : (
                <button
                  className="max-w-[11rem] truncate rounded-full px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  onClick={() => onNavigate(crumb.target)}
                  type="button"
                >
                  {crumb.label}
                </button>
              )}
            </span>
          );
        })}
      </nav>

      <div className="flex shrink-0 items-center gap-0.5">{actions}</div>
    </header>
  );
}
