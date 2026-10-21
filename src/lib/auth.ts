export function assertInboxSecret(request: Request): Response | null {
  const expected = process.env.INBOX_SECRET;
  if (!expected) {
    return json({ error: "INBOX_SECRET not configured" }, 500);
  }
  const got = request.headers.get("x-inbox-secret");
  if (got !== expected) {
    return json({ error: "Unauthorized" }, 401);
  }
  return null;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
