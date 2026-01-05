import { SwaggerUIWrapper } from "@/components/swagger-ui";
import { buildOpenApiSpec } from "@/lib/openapi";

export default function SwaggerPage() {
  const spec = buildOpenApiSpec();

  return (
    <section className="flex h-full flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">API Documentation</h1>
        <p className="text-sm text-muted-foreground">
          Generated automatically from Next.js route handlers via next-swagger-doc.
        </p>
      </header>
      <div className="flex-1 overflow-hidden rounded-lg border bg-white shadow-sm">
        <SwaggerUIWrapper spec={spec} />
      </div>
    </section>
  );
}

