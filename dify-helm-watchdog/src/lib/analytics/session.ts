const FALLBACK_SALT = "dify-watchdog-analytics-fallback";
const encoder = new TextEncoder();

const toHex = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
};

const getSalt = (): string => {
  return process.env.ANALYTICS_SESSION_SALT?.trim() || FALLBACK_SALT;
};

const extractIp = (headers: Headers): string => {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") ||
    "0.0.0.0"
  );
};

export const computeSessionHashFromHeaders = async (
  headers: Headers,
): Promise<string> => {
  const ip = extractIp(headers);
  const ua = headers.get("user-agent") ?? "";
  const salt = getSalt();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`${ip}\n${ua}\n${salt}`),
  );
  return toHex(digest);
};

export const computeSessionHashFromRequest = (
  req: Request,
): Promise<string> => computeSessionHashFromHeaders(req.headers);
