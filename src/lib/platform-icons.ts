import type { AccountPlatform } from "./devices";

/** Outline icons (SVG); colored via CSS mask + currentColor. */
export const PLATFORM_ICON: Record<AccountPlatform, string> = {
  instagram: "/icons/instagram.svg",
  tiktok: "/icons/tiktok.svg",
};

/** Inline markup for calendar / table (dark UI, currentColor via CSS mask). */
export function platformIconHtml(
  platform: AccountPlatform | string | null | undefined,
  opts: { className?: string; label?: string } = {},
): string {
  const key = platform === "instagram" ? "instagram" : "tiktok";
  const src = PLATFORM_ICON[key];
  const cls = opts.className ? `platform-icon ${opts.className}` : "platform-icon";
  const label = opts.label ?? (key === "instagram" ? "Instagram" : "TikTok");
  return `<span class="${cls}" data-platform="${key}" role="img" aria-label="${label}" style="--icon:url('${src}')"></span>`;
}
