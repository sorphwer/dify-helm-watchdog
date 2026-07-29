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

  it("documents the MCP Streamable HTTP transport without SSE or batch requests", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    const request = new Request("http://localhost/openapi.json");
    const response = await GET(request);

    const payload = (await response.json()) as {
      paths?: Record<string, unknown>;
    };
    const paths = payload.paths ?? {};

    // The legacy SSE transport is gone: no documented path references it.
    const ssePaths = Object.keys(paths).filter((key) => /sse/i.test(key));
    expect(ssePaths).toEqual([]);

    // The Streamable HTTP endpoint no longer documents undocumented batch
    // (JSON-RPC array) requests: the POST requestBody schema must not offer an
    // array branch, whether directly typed or via oneOf.
    const mcpPost = (paths["/api/v1/mcp"] as { post?: unknown } | undefined)
      ?.post as
      | {
          requestBody?: {
            content?: {
              "application/json"?: {
                schema?: {
                  type?: string;
                  oneOf?: Array<{ type?: string }>;
                };
              };
            };
          };
        }
      | undefined;
    const schema =
      mcpPost?.requestBody?.content?.["application/json"]?.schema;
    expect(schema).toBeDefined();
    expect(schema?.type).not.toBe("array");
    if (Array.isArray(schema?.oneOf)) {
      expect(schema?.oneOf?.every((branch) => branch.type !== "array")).toBe(
        true,
      );
    }
  });
});


