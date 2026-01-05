import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { applyImageTagUpdates, normalizeYamlInput } from "@/lib/values-wizard";

const readCacheFile = (relativePath: string) => {
  const fullPath = path.join(process.cwd(), relativePath);
  return fs.readFileSync(fullPath, "utf-8");
};

describe("values wizard", () => {
  it("updates v3.5.5 values.yaml with v3.6.2 image tag map without throwing", () => {
    const values355 = readCacheFile(".cache/helm/values/3.5.5.yaml");
    const images362 = readCacheFile(".cache/helm/images/3.6.2.yaml");
    const imageMap = YAML.parse(images362) as Record<
      string,
      { repository?: string; tag?: string }
    >;

    const result = applyImageTagUpdates(values355, imageMap);
    expect(result.changes.length).toBeGreaterThan(0);
    expect(result.changes.some((c) => c.status === "missing")).toBe(false);
    expect(result.updatedYaml).toContain("api:");
  });

  it("normalizes indentation tabs at the beginning of a line", () => {
    const raw = "\tkey: value\r\n\tchild:\n\t\t- item\n";
    const normalized = normalizeYamlInput(raw);
    expect(normalized).not.toMatch(/^\t/m);
    expect(normalized).toContain("\n");
  });
});



