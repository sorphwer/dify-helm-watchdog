import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import {
  mergeImageOverridesIntoTemplate,
  normalizeYamlInput,
} from "@/lib/values-wizard";

const FIXTURES_DIR = "src/test/wizard-testcases";

const readFixture = (relativePath: string) => {
  const fullPath = path.join(process.cwd(), FIXTURES_DIR, relativePath);
  return fs.readFileSync(fullPath, "utf-8");
};

type ImageMap = Record<string, { repository?: string; tag?: string }>;

describe("values wizard", () => {
  describe("upgrade to 3.6.2", () => {
    it("upgrades 355-default to 362", () => {
      const input = readFixture("355-default.yaml");
      const template = readFixture("templates/362.yaml");
      const images = YAML.parse(readFixture("images/362.yaml")) as ImageMap;
      const expected = readFixture("355-default-changedTo362.yaml");

      const { updatedYaml, changes } = mergeImageOverridesIntoTemplate(
        input,
        template,
        images
      );

      expect(changes.length).toBeGreaterThan(0);
      expect(changes.some((c) => c.status === "missing")).toBe(false);
      expect(updatedYaml).toBe(expected);
    });
  });

  describe("upgrade to 3.7.3", () => {
    const template373 = () => readFixture("templates/373.yaml");
    const images373 = () => YAML.parse(readFixture("images/373.yaml")) as ImageMap;

    it("upgrades 362-missing-repo to 373 (user config has tags only, no repository)", () => {
      const input = readFixture("362-missing-repo.yaml");
      const expected = readFixture("362-missing-repo-changedTo373.yaml");

      const { updatedYaml, changes } = mergeImageOverridesIntoTemplate(
        input,
        template373(),
        images373()
      );

      expect(changes.length).toBeGreaterThan(0);
      expect(changes.some((c) => c.status === "missing")).toBe(false);
      expect(updatedYaml).toBe(expected);
    });

    it("upgrades 362-missing-tag to 373 (user config has repositories only, no tag)", () => {
      const input = readFixture("362-missing-tag.yaml");
      const expected = readFixture("362-missing-tag-changedTo373.yaml");

      const { updatedYaml, changes } = mergeImageOverridesIntoTemplate(
        input,
        template373(),
        images373()
      );

      expect(changes.length).toBeGreaterThan(0);
      expect(changes.some((c) => c.status === "missing")).toBe(false);
      expect(updatedYaml).toBe(expected);

      // Verify custom repositories are preserved
      const parsed = YAML.parse(updatedYaml) as Record<string, { image: { repository: string } }>;
      expect(parsed.api.image.repository).toBe("example.com/custom/dify-api");
      expect(parsed.web.image.repository).toBe("example.com/custom/dify-web");
    });

    it("upgrades 362-custom-comments to 373 (user config has YAML comments)", () => {
      const input = readFixture("362-custom-comments.yaml");
      const expected = readFixture("362-custom-comments-changedTo373.yaml");

      const { updatedYaml, changes } = mergeImageOverridesIntoTemplate(
        input,
        template373(),
        images373()
      );

      expect(changes.length).toBeGreaterThan(0);
      expect(changes.some((c) => c.status === "missing")).toBe(false);
      expect(updatedYaml).toBe(expected);

      // Verify custom repositories from comments variant are preserved
      const parsed = YAML.parse(updatedYaml) as Record<string, { image: { repository: string } }>;
      expect(parsed.api.image.repository).toBe("registry.internal.example.com/dify/dify-api");
    });
  });

  describe("edge cases", () => {
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
});
