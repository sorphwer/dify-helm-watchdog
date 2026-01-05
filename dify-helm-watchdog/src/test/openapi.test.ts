import { GET } from "@/app/openapi.json/route";

describe("GET /openapi.json", () => {
  it("should return OpenAPI JSON document", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    const request = new Request("http://localhost/openapi.json");
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/json; charset=utf-8",
    );

    const payload = (await response.json()) as {
      openapi?: string;
      info?: { title?: string; version?: string };
      servers?: Array<{ url?: string }>;
      paths?: Record<string, unknown>;
      components?: {
        schemas?: Record<string, unknown>;
        securitySchemes?: Record<string, unknown>;
      };
    };

    expect(payload.openapi).toBe("3.1.0");
    expect(payload.info).toMatchObject({
      title: "dify-helm-watchdog API",
      version: "1.0.0",
    });
    expect(payload.servers?.[0]?.url).toBe("http://localhost:3000");
    expect(payload.components?.schemas).toBeDefined();
    expect(payload.components?.securitySchemes).toHaveProperty("bearerAuth");
    expect(payload.paths).toBeDefined();
    expect(payload.paths).toHaveProperty("/api/v1/versions");
  });
});


