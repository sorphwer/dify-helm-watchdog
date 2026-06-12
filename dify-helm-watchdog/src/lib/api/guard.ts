// Structural request guards that let the edge middleware and route handlers
// reject security-scanner fuzzing (path traversal, SSRF, LFI, CRLF injection)
// before any expensive work runs. Kept dependency-free so it stays cheap to
// evaluate on the edge.

// Canonical chart-version shape, anchored at both ends. Accepts the SemVer core
// plus optional prerelease/build metadata, which real cache entries use
// (e.g. "2.4.0-fix.1", "3.1.0-beta.1", "1.0.0+build.5"). The charset cannot
// express a slash, percent, backslash, colon, or control character, so no
// scanner payload can satisfy it.
export const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

export const isValidVersion = (version: string): boolean =>
  VERSION_RE.test(version);

// Byte patterns that never appear in a legitimate /api/v1 path — legit paths use
// only [A-Za-z0-9._/-] (version dots are always single-separated). Tested
// case-insensitively against the RAW, still-encoded path so percent-encoded
// evasions (%2e, %252f, %c0%af) remain visible.
//
//   \.\.                literal ".." traversal (incl. "..%2f", "..\")
//   %2e %2f %5c         encoded dot / slash / backslash
//   \\                  raw backslash (Windows-style traversal)
//   %25                 encoded "%" — the double-encoding marker (%252f, %252e)
//   %00 / \x00-\x1f\x7f null byte and raw control bytes incl. CR/LF/TAB
//   %0d %0a %09         encoded CR / LF / TAB (CRLF / header injection)
//   %[c-f].. %[89ab]..  high-bit / overlong-UTF-8 bytes (e.g. %c0%af)
//   [:@] / %3a %40      host:port / userinfo (SSRF targets), raw and encoded
const SUSPICIOUS_RE =
  /(\.\.|%2e|%2f|%5c|\\|%25|%00|[\x00-\x1f\x7f]|%0d|%0a|%09|%[c-f][0-9a-f]|%[89ab][0-9a-f]|[:@]|%3a|%40)/i;

export const isSuspiciousApiPath = (rawPath: string): boolean =>
  SUSPICIOUS_RE.test(rawPath);
