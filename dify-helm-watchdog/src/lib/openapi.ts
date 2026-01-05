import { createSwaggerSpec } from "next-swagger-doc";

export const OPENAPI_VERSION = "3.1.0";

type OpenApiSpec = {
  servers?: Array<{ url: string }>;
  components?: {
    schemas?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
  };
  // Keep it flexible: next-swagger-doc adds many other OpenAPI fields.
  [key: string]: unknown;
};

const resolveServerUrl = (): string => {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
};

export const buildOpenApiSpec = (): OpenApiSpec => {
  const spec = createSwaggerSpec({
    apiFolder: "src/app/api",
    definition: {
      openapi: OPENAPI_VERSION,
      info: {
        title: "dify-helm-watchdog API",
        version: "1.0.0",
        description:
          "API documentation generated from Next.js route handlers using next-swagger-doc.",
      },
      servers: [{ url: resolveServerUrl() }],
      components: {
        schemas: {},
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
  }) as unknown as OpenApiSpec;

  // Normalize shape for better compatibility with downstream tooling.
  spec.servers ??= [{ url: resolveServerUrl() }];
  const components = (spec.components ??= {});
  components.schemas ??= {};
  components.securitySchemes ??= {
    bearerAuth: {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
    },
  };

  return spec;
};


