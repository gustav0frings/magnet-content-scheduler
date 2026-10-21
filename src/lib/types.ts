import type { CountryCode } from "./devices";

export type ScheduleItem = {
  id: string;
  /**
   * Accounts this video is scheduled for (Instagram + TikTok, etc.).
   * Always normalized on read; at least one id.
   */
  deviceIds: string[];
  /**
   * Primary account id (= `deviceIds[0]`). Kept for inbox / older clients.
   * Prefer `deviceIds`.
   */
  deviceId: string;
  /** Country of the primary account (badge / legacy filter). */
  country: CountryCode;
  title: string;
  /** Public UploadThing URL (`ufsUrl`) */
  url: string;
  fileKey: string;
  /** ISO 8601 */
  publishAt: string;
  /** ISO 8601 when marked saved by phone shortcut */
  savedAt: string | null;
  /** ISO 8601 when marked published in the calendar (download or check). Null = not published. */
  publishedAt: string | null;
  createdAt: string;
};

export type InboxItem = {
  id: string;
  title: string;
  url: string;
};
