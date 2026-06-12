import {
  isSuspiciousApiPath,
  isValidVersion,
} from "@/lib/api/guard";

describe("isSuspiciousApiPath", () => {
  it.each([
    // path traversal, raw and encoded (incl. double-encoded)
    "/api/v1/versions/..%2f..%2fetc%2fpasswd/values",
    "/api/v1/releases/..%2f..%2f..%2fetc%2fpasswd",
    "/api/v1/versions/%2e%2e%2f",
    "/api/v1/versions/..%252f..%252fetc%252fpasswd/values",
    "/api/v1/releases/3.10.0%2f..%2f..%2f..%2fblog",
    // overlong UTF-8 and high-bit bytes
    "/api/v1/releases/v3.10.0%c0%af..%c0%af",
    // null byte and control / CRLF
    "/api/v1/versions/%00",
    "/api/v1/releases/3.1.0%0d%0ahost:%20169.254.169.254",
    // SSRF host:port / userinfo
    "/api/v1/releases/localhost:8080",
    "/api/v1/releases/3.10.0%40169.254.169.254",
    // backslash traversal
    "/api/v1/versions/..%5c..%5c",
    // case-insensitivity
    "/api/v1/versions/%2E%2E%2F",
  ])("flags scanner path %s", (path) => {
    expect(isSuspiciousApiPath(path)).toBe(true);
  });

  it.each([
    "/api/v1/versions",
    "/api/v1/versions/latest",
    "/api/v1/versions/3.10.0",
    "/api/v1/versions/2.4.0-fix.1/values",
    "/api/v1/versions/3.1.0-beta.1/images",
    "/api/v1/versions/2.5.0/validation",
    "/api/v1/releases/3.10.0",
    "/api/v1/cache",
    "/api/v1/mcp",
    "/api/v1/sse",
  ])("passes legit path %s", (path) => {
    expect(isSuspiciousApiPath(path)).toBe(false);
  });
});

describe("isValidVersion", () => {
  it.each([
    "2.5.0",
    "3.10.0",
    "2.4.0-fix.1",
    "3.1.0-beta.1",
    "1.0.0+build.5",
  ])("accepts %s", (v) => {
    expect(isValidVersion(v)).toBe(true);
  });

  it.each([
    "latest",
    "2.4",
    "169.254.169.254",
    "../etc/passwd",
    "2.5.0/../",
    "2.5.0%2f",
    " 2.5.0",
    "2.5.0-",
    "v3.10.0",
    "",
  ])("rejects %s", (v) => {
    expect(isValidVersion(v)).toBe(false);
  });
});
