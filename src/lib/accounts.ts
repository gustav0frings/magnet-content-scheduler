import { ACCOUNTS_FILE, readJsonFile, uploadJsonFile } from "./uploadthing";

export type AccountPlatform = "instagram" | "tiktok";

export const ACCOUNT_PLATFORMS: AccountPlatform[] = ["instagram", "tiktok"];

export type Account = {
  id: string;
  name: string;
  platform: AccountPlatform;
  /** Linked phone / device id, or null */
  deviceId: string | null;
  /**
   * Warm-up start date as `YYYY-MM-DD`, or null when not in warm-up.
   * Day count = calendar days since this date (start day = 1).
   */
  warmupStartedAt: string | null;
  createdAt: string;
};

function todayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDayKey(raw: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** Calendar days in warm-up (start day = 1). Null if not warming up. */
export function warmupDayCount(
  warmupStartedAt: string | null,
  now = new Date(),
): number | null {
  if (!warmupStartedAt) return null;
  const start = parseDayKey(warmupStartedAt);
  if (!start) return null;
  const today = parseDayKey(todayKey(now));
  if (!today) return null;
  const ms = today.getTime() - start.getTime();
  if (ms < 0) return 0;
  return Math.floor(ms / 86_400_000) + 1;
}

export function normalizeAccountName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 60);
}

export function normalizePlatform(
  raw: string | null | undefined,
): AccountPlatform {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (value === "instagram" || value === "tiktok") return value;
  throw new Error("platform must be instagram or tiktok");
}

function normalizeWarmupDate(raw: string | null | undefined): string | null {
  if (raw == null || raw === "") return null;
  if (!parseDayKey(raw)) throw new Error("invalid warmupStartedAt");
  return raw.trim().slice(0, 10);
}

function coercePlatform(raw: unknown): AccountPlatform {
  try {
    return normalizePlatform(typeof raw === "string" ? raw : undefined);
  } catch {
    return "tiktok";
  }
}

export async function listAccounts(): Promise<Account[]> {
  const data = await readJsonFile<Account[]>(ACCOUNTS_FILE);
  const items = Array.isArray(data) ? data : [];
  return items
    .filter((a) => a?.id && a?.name)
    .map((a) => ({
      ...a,
      platform: coercePlatform(a.platform),
      deviceId: a.deviceId ?? null,
      warmupStartedAt: a.warmupStartedAt ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveAccounts(accounts: Account[]): Promise<void> {
  await uploadJsonFile(ACCOUNTS_FILE, accounts);
}

export async function addAccount(input: {
  name: string;
  platform: string;
  deviceId?: string | null;
  warmupStartedAt?: string | null;
}): Promise<Account> {
  const name = normalizeAccountName(input.name);
  if (!name) throw new Error("name required");
  const platform = normalizePlatform(input.platform);

  const accounts = await listAccounts();
  const next: Account = {
    id: crypto.randomUUID(),
    name,
    platform,
    deviceId: input.deviceId?.trim() || null,
    warmupStartedAt: normalizeWarmupDate(input.warmupStartedAt),
    createdAt: new Date().toISOString(),
  };
  accounts.push(next);
  await saveAccounts(accounts);
  return next;
}

export async function updateAccount(
  id: string,
  patch: {
    name?: string;
    platform?: string;
    deviceId?: string | null;
    warmupStartedAt?: string | null;
  },
): Promise<Account | null> {
  const accounts = await listAccounts();
  const account = accounts.find((a) => a.id === id);
  if (!account) return null;

  if (patch.name !== undefined) {
    const name = normalizeAccountName(patch.name);
    if (!name) throw new Error("name required");
    account.name = name;
  }
  if (patch.platform !== undefined) {
    account.platform = normalizePlatform(patch.platform);
  }
  if (patch.deviceId !== undefined) {
    account.deviceId = patch.deviceId?.trim() || null;
  }
  if (patch.warmupStartedAt !== undefined) {
    account.warmupStartedAt = normalizeWarmupDate(patch.warmupStartedAt);
  }

  await saveAccounts(accounts);
  return account;
}

export async function removeAccount(id: string): Promise<boolean> {
  const accounts = await listAccounts();
  const next = accounts.filter((a) => a.id !== id);
  if (next.length === accounts.length) return false;
  await saveAccounts(next);
  return true;
}
