import { GET } from "@/app/api/v1/analytics/route";
import { queryAnalytics } from "@/lib/analytics/track";

jest.mock("@/lib/analytics/track", () => ({
  queryAnalytics: jest.fn(),
}));

const mockedQuery = queryAnalytics as jest.MockedFunction<typeof queryAnalytics>;

describe("GET /api/v1/analytics", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  const sample = {
    window: "7d" as const,
    generatedAt: "2026-05-09T00:00:00.000Z",
    mcp: { total: 10, uv: 4, byName: [{ name: "list_versions", hits: 10 }] },
    api: { total: 20, uv: 6, byName: [{ name: "versions", hits: 20 }] },
    page: { total: 33, uv: 12, byName: [] },
    byCountry: [
      { country: "US", hits: 40, uv: 15 },
      { country: "CN", hits: 18, uv: 5 },
      { country: "XX", hits: 5, uv: 2 },
    ],
  };

  it("defaults to 7d window when no param is provided", async () => {
    mockedQuery.mockResolvedValueOnce(sample);
    const response = await GET(new Request("http://localhost/api/v1/analytics"));
    expect(response.status).toBe(200);
    expect(mockedQuery).toHaveBeenCalledWith("7d");
    const body = await response.json();
    expect(body).toEqual(sample);
  });

  it.each(["7d", "30d", "90d"])("accepts window=%s", async (w) => {
    mockedQuery.mockResolvedValueOnce({ ...sample, window: w as never });
    const response = await GET(
      new Request(`http://localhost/api/v1/analytics?window=${w}`),
    );
    expect(response.status).toBe(200);
    expect(mockedQuery).toHaveBeenCalledWith(w);
  });

  it("falls back to 7d for invalid window", async () => {
    mockedQuery.mockResolvedValueOnce(sample);
    const response = await GET(
      new Request("http://localhost/api/v1/analytics?window=999d"),
    );
    expect(response.status).toBe(200);
    expect(mockedQuery).toHaveBeenCalledWith("7d");
  });

  it("returns 502 when the worker query fails", async () => {
    mockedQuery.mockRejectedValueOnce(new Error("upstream boom"));
    const response = await GET(new Request("http://localhost/api/v1/analytics"));
    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: { status: string; message: string } };
    expect(body.error.status).toBe("UNAVAILABLE");
    expect(body.error.message).toContain("upstream boom");
  });

  it("sets edge cache headers on success", async () => {
    mockedQuery.mockResolvedValueOnce(sample);
    const response = await GET(new Request("http://localhost/api/v1/analytics"));
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=900",
    );
  });
});
