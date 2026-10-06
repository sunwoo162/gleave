export function getResponseCookies(headers: Headers): string[] {
  const headersWithGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  const cookies = headersWithGetSetCookie.getSetCookie?.() ?? [];
  if (cookies.length > 0) return cookies;

  const fallback = headers.get("set-cookie");
  return fallback ? [fallback] : [];
}
