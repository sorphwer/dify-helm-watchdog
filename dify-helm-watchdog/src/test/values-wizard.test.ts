import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import {
  mergeImageOverridesIntoTemplate,
  normalizeYamlInput,
} from "@/lib/values-wizard";

const readCacheFile = (relativePath: string) => {
  const fullPath = path.join(process.cwd(), relativePath);
  return fs.readFileSync(fullPath, "utf-8");
};

describe("values wizard", () => {
  it("updates v3.5.5 values.yaml with v3.6.2 image tag map without throwing", () => {
    const values355 = readCacheFile(".cache/helm/values/3.5.5.yaml");
    const values362 = readCacheFile(".cache/helm/values/3.6.2.yaml");
    const images362 = readCacheFile(".cache/helm/images/3.6.2.yaml");
    const imageMap = YAML.parse(images362) as Record<
      string,
      { repository?: string; tag?: string }
    >;

    const result = mergeImageOverridesIntoTemplate(values355, values362, imageMap);
    expect(result.changes.length).toBeGreaterThan(0);
    expect(result.changes.some((c) => c.status === "missing")).toBe(false);
    expect(result.updatedYaml).toContain("api:");
  });

  it("fills missing services from template and enforces new tags", () => {
    const templateYaml = `
api:
  image:
    repository: langgenius/dify-api
    tag: "0.10.0"
`;
    const overridesYaml = `
web:
  image:
    repository: langgenius/dify-web
`;
    const imageMap = {
      api: { repository: "langgenius/dify-api", tag: "0.11.0" },
    };

    const { updatedYaml } = mergeImageOverridesIntoTemplate(
      overridesYaml,
      templateYaml,
      imageMap,
    );
    const parsed = YAML.parse(updatedYaml) as Record<string, { image: { tag: string } }>;
    expect(parsed.api.image.tag).toBe("0.11.0");
  });

  it("keeps repository overrides while enforcing new tags", () => {
    const templateYaml = `
api:
  image:
    repository: langgenius/dify-api
    tag: "0.10.0"
`;
    const overridesYaml = `
api:
  image:
    repository: example.com/custom/dify-api
`;
    const imageMap = {
      api: { repository: "langgenius/dify-api", tag: "0.11.0" },
    };

    const { updatedYaml } = mergeImageOverridesIntoTemplate(
      overridesYaml,
      templateYaml,
      imageMap,
    );
    const parsed = YAML.parse(updatedYaml) as Record<string, { image: { repository: string; tag: string } }>;
    expect(parsed.api.image.repository).toBe("example.com/custom/dify-api");
    expect(parsed.api.image.tag).toBe("0.11.0");
  });

  it("normalizes indentation tabs at the beginning of a line", () => {
    const raw = "\tkey: value\r\n\tchild:\n\t\t- item\n";
    const normalized = normalizeYamlInput(raw);
    expect(normalized).not.toMatch(/^\t/m);
    expect(normalized).toContain("\n");
  });
});



