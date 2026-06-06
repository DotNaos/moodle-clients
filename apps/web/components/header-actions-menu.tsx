"use client";

import { useClerk } from "@clerk/nextjs";
import { KeyRound, LogOut, RefreshCw, UserCircle } from "lucide-react";
import type { ReactNode } from "react";

import { APIKeyPanel } from "@/components/api-key-menu";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import type { User } from "@/lib/dashboard-data";

export function HeaderActionsMenu({
  buttonClassName,
  loading,
  refreshing,
  triggerContent,
  user,
  onRefresh,
}: {
  buttonClassName?: string;
  loading: boolean;
  refreshing: boolean;
  triggerContent?: ReactNode;
  user: User | null;
  onRefresh: () => void;
}) {
  const { openUserProfile, signOut } = useClerk();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className={buttonClassName ?? "h-11 px-3 sm:px-4"} type="button" variant="secondary" aria-label="Open profile menu">
          {triggerContent ?? (
            <>
              <UserCircle aria-hidden />
              <span className="hidden sm:inline">Profile</span>
            </>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[min(92vw,420px)] rounded-[1.75rem] border-0 bg-card p-4 shadow-xl">
        <div className="flex flex-col gap-4">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Account</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {user ? user.displayName : "Signed in"}
              </p>
              {user?.moodleSiteUrl ? (
                <p className="mt-1 truncate text-xs text-muted-foreground">{user.moodleSiteUrl}</p>
              ) : null}
            </div>
            <UserCircle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          </div>

          <Button className="justify-start" type="button" variant="secondary" onClick={onRefresh}>
            {loading || refreshing ? <Spinner aria-hidden /> : <RefreshCw aria-hidden />}
            {refreshing ? "Updating Moodle" : "Refresh Moodle"}
          </Button>

          <div className="border-t border-border pt-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <KeyRound className="size-4 text-muted-foreground" aria-hidden />
              API key
            </div>
            <APIKeyPanel />
          </div>

          <div className="grid grid-cols-1 gap-2 border-t border-border pt-4 sm:grid-cols-2">
            <Button type="button" variant="secondary" onClick={() => openUserProfile()}>
              <UserCircle aria-hidden />
              Profile
            </Button>
            <Button type="button" variant="secondary" onClick={() => void signOut()}>
              <LogOut aria-hidden />
              Sign out
            </Button>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
