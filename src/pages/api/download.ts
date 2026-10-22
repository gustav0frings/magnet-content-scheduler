import type { APIRoute } from "astro";
import { json } from "../../lib/auth";

export const prerender = false;

const ALLOWED_HOSTS = [".utfs.io", ".ufs.sh", ".uploadthing.com"];

function isAllowedVideoUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return ALLOWED_HOSTS.some(
      (suffix) => host === suffix.slice(1) || host.endsWith(suffix),
    );
  } catch {
    return false;
  }
}

function safeFilename(raw: string): string {
  const base = raw
    .trim()
    .replace(/\.mp4$/i, "")
    .replace(/[^\w\s\-À-ÿ'.]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `${base || "video"}.mp4`;
}

export const GET: APIRoute = async ({ url }) => {
  const target = url.searchParams.get("url");
  const name = safeFilename(url.searchParams.get("name") || "video");
  const inline = url.searchParams.get("inline") === "1";

  if (!target || !isAllowedVideoUrl(target)) {
    return json({ error: "Invalid url" }, 400);
  }

  const upstream = await fetch(target);
  if (!upstream.ok || !upstream.body) {
    return json({ error: "Upstream failed" }, 502);
  }

  const disposition = inline
    ? `inline; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`
    : `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`;

  const headers = new Headers({
    "Content-Type": upstream.headers.get("content-type") || "video/mp4",
    "Content-Disposition": disposition,
    "Cache-Control": "private, max-age=3600",
  });
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);

  return new Response(upstream.body, { headers });
};
