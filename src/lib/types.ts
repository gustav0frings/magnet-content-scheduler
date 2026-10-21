import type { CountryCode } from "./devices";

export type ScheduleItem = {
  id: string;
  deviceId: string;
  country: CountryCode;
  title: string;
  /** Public UploadThing URL (`ufsUrl`) */
  url: string;
  fileKey: string;
  /** ISO 8601 */
  publishAt: string;
  /** ISO 8601 when marked saved by phone shortcut */
  savedAt: string | null;
  createdAt: string;
};

export type InboxItem = {
  id: string;
  title: string;
  url: string;
};
