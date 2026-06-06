"use client";

import { AlertCircle, CheckCircle2, RefreshCw, Shield, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AdminUser = {
  id: string;
  moodleSiteUrl: string;
  moodleUserId: number;
  displayName: string;
  clerkUserId?: string;
  isAdmin: boolean;
  codexStateQuotaBytes: number;
  codexStateUsageBytes: number;
  codexStateSnapshotCount: number;
  codexStateQuotaConfiguredByDefault: boolean;
};

type AdminUsersResponse = {
  defaultQuotaBytes: number;
  maxQuotaBytes: number;
  users: AdminUser[];
};

type AdminUserResponse = {
  defaultQuotaBytes: number;
  maxQuotaBytes: number;
  user: AdminUser;
};

type Message = {
  kind: "idle" | "ok" | "error";
  text: string;
};

const fallbackDefaultQuotaBytes = 128 * 1024 * 1024;
const fallbackMaxQuotaBytes = 5 * 1024 * 1024 * 1024;

export function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [defaultQuotaBytes, setDefaultQuotaBytes] = useState(fallbackDefaultQuotaBytes);
  const [maxQuotaBytes, setMaxQuotaBytes] = useState(fallbackMaxQuotaBytes);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<Message>({ kind: "idle", text: "Load users to manage Codex session quotas." });
  const loadedUsageBytes = useMemo(() => users.reduce((sum, user) => sum + user.codexStateUsageBytes, 0), [users]);

  useEffect(() => {
    void loadUsers();
  }, []);

  async function loadUsers() {
    setIsBusy(true);
    try {
      const payload = await requestAdmin<AdminUsersResponse>("GET");
      setDefaultQuotaBytes(payload.defaultQuotaBytes);
      setMaxQuotaBytes(payload.maxQuotaBytes);
      setUsers(payload.users ?? []);
      setMessage({ kind: "ok", text: `Loaded ${payload.users?.length ?? 0} users.` });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Could not load users." });
    } finally {
      setIsBusy(false);
    }
  }

  async function updateUser(userId: string, body: Record<string, unknown>) {
    setIsBusy(true);
    try {
      const payload = await requestAdmin<AdminUserResponse>("PATCH", { userId, ...body });
      setDefaultQuotaBytes(payload.defaultQuotaBytes);
      setMaxQuotaBytes(payload.maxQuotaBytes);
      setUsers((current) => current.map((user) => (user.id === payload.user.id ? payload.user : user)));
      setMessage({ kind: "ok", text: "User updated." });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Could not update user." });
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <Shield />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-normal">Admin</h1>
              <p className="truncate text-sm text-muted-foreground">Codex session storage per user</p>
            </div>
          </div>
          <Button className="rounded-full" disabled={isBusy} onClick={() => void loadUsers()}>
            <RefreshCw className={cn(isBusy && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </header>

      <section className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
        <div className="flex flex-wrap gap-2">
          <Badge>Default: {formatBytes(defaultQuotaBytes)}</Badge>
          <Badge>Max: {formatBytes(maxQuotaBytes)}</Badge>
          <Badge>Loaded usage: {formatBytes(loadedUsageBytes)}</Badge>
        </div>

        <StatusMessage message={message} />

        <section className="overflow-hidden rounded-[24px] border bg-card">
          <div className="grid grid-cols-[minmax(240px,1.4fr)_0.8fr_1fr_140px] gap-3 border-b px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted-foreground max-lg:hidden">
            <span>User</span>
            <span>Usage</span>
            <span>Quota</span>
            <span>Admin</span>
          </div>
          {users.length === 0 ? (
            <div className="flex min-h-48 items-center justify-center p-8 text-center text-sm text-muted-foreground">
              No users loaded.
            </div>
          ) : (
            <div className="divide-y">
              {users.map((user) => (
                <UserQuotaRow
                  key={user.id}
                  user={user}
                  maxQuotaBytes={maxQuotaBytes}
                  isBusy={isBusy}
                  onSetQuota={(quotaBytes) => updateUser(user.id, { codexStateQuotaBytes: quotaBytes })}
                  onResetQuota={() => updateUser(user.id, { resetCodexStateQuota: true })}
                  onToggleAdmin={(isAdmin) => updateUser(user.id, { isAdmin })}
                />
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function UserQuotaRow({
  user,
  maxQuotaBytes,
  isBusy,
  onSetQuota,
  onResetQuota,
  onToggleAdmin,
}: {
  user: AdminUser;
  maxQuotaBytes: number;
  isBusy: boolean;
  onSetQuota: (quotaBytes: number) => void;
  onResetQuota: () => void;
  onToggleAdmin: (isAdmin: boolean) => void;
}) {
  const [quotaMiB, setQuotaMiB] = useState(() => Math.round(user.codexStateQuotaBytes / 1024 / 1024).toString());
  const title = user.displayName || `Moodle user ${user.moodleUserId}`;
  const maxQuotaMiB = Math.floor(maxQuotaBytes / 1024 / 1024);

  useEffect(() => {
    setQuotaMiB(Math.round(user.codexStateQuotaBytes / 1024 / 1024).toString());
  }, [user.codexStateQuotaBytes]);

  function saveQuota() {
    const value = Number(quotaMiB);
    if (!Number.isFinite(value) || value <= 0) return;
    onSetQuota(Math.round(value * 1024 * 1024));
  }

  return (
    <article className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(240px,1.4fr)_0.8fr_1fr_140px] lg:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{title}</p>
        <p className="break-words text-xs text-muted-foreground">{[user.clerkUserId, user.moodleSiteUrl].filter(Boolean).join(" · ")}</p>
      </div>
      <Metric label="Usage" value={`${formatBytes(user.codexStateUsageBytes)} · ${user.codexStateSnapshotCount} snapshots`} />
      <div className="grid gap-2 sm:grid-cols-[minmax(100px,140px)_auto_auto]">
        <input
          className="h-10 min-w-0 rounded-full border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
          type="number"
          min={1}
          max={maxQuotaMiB}
          value={quotaMiB}
          onChange={(event) => setQuotaMiB(event.target.value)}
        />
        <Button variant="secondary" disabled={isBusy} onClick={saveQuota}>
          Save MiB
        </Button>
        <Button variant="ghost" disabled={isBusy} onClick={onResetQuota}>
          {user.codexStateQuotaConfiguredByDefault ? "Default" : "Reset"}
        </Button>
      </div>
      <label className="inline-flex items-center gap-2 text-sm font-semibold">
        <input
          className="size-4 accent-foreground"
          type="checkbox"
          checked={user.isAdmin}
          disabled={isBusy}
          onChange={(event) => onToggleAdmin(event.target.checked)}
        />
        Admin
      </label>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 lg:block">
      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground lg:hidden">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

function StatusMessage({ message }: { message: Message }) {
  const Icon = message.kind === "error" ? AlertCircle : message.kind === "ok" ? CheckCircle2 : Users;
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm font-medium",
        message.kind === "error" && "text-destructive",
        message.kind === "ok" && "text-emerald-700",
        message.kind === "idle" && "text-muted-foreground",
      )}
    >
      <Icon className="size-4" />
      <span>{message.text}</span>
    </div>
  );
}

async function requestAdmin<T>(method: "GET" | "PATCH", body?: unknown): Promise<T> {
  const response = await fetch("/api/admin/users", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : "Admin request failed.");
  }
  return payload as T;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return "-";
  const units = ["B", "KiB", "MiB", "GiB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const precision = value >= 10 || unit === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unit]}`;
}
