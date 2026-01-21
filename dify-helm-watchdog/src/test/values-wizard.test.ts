import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import {
  applyImageTagUpdates,
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

      const { updatedYaml, changes } = mergeImageOverridesIntoTemplate(
        input,
        template,
        images
      );
      const parsed = YAML.parse(updatedYaml) as Record<string, any>;
      const templateParsed = YAML.parse(template) as Record<string, any>;

      expect(changes.length).toBeGreaterThan(0);
      expect(changes.some((c) => c.status === "missing")).toBe(false);
      expect(parsed.api.image.tag).toBe(images.api?.tag);
      Object.keys(templateParsed).forEach((key) => {
        expect(parsed).toHaveProperty(key);
      });
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
      expect(YAML.parse(updatedYaml)).toEqual(YAML.parse(expected));
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
      expect(YAML.parse(updatedYaml)).toEqual(YAML.parse(expected));

      // Verify custom repositories are preserved
      const parsed = YAML.parse(updatedYaml) as Record<string, { image: { repository: string } }>;
      expect(parsed.api.image.repository).toBe("example.com/custom/dify-api");
      expect(parsed.web.image.repository).toBe("example.com/custom/dify-web");
    });

    it("upgrades 362-custom-comments to 373 (user config has YAML comments)", () => {
      const input = readFixture("362-custom-comments.yaml");

      const { updatedYaml, changes } = mergeImageOverridesIntoTemplate(
        input,
        template373(),
        images373()
      );
      const parsed = YAML.parse(updatedYaml) as Record<string, { image: { repository: string; tag: string } }>;

      expect(changes.length).toBeGreaterThan(0);
      expect(changes.some((c) => c.status === "missing")).toBe(false);
      expect(parsed.api.image.tag).toBe(images373().api?.tag);
      expect(updatedYaml).toContain("Custom Production Configuration for Dify Helm Chart");

      // Verify custom repositories from comments variant are preserved
      expect(parsed.api.image.repository).toBe("registry.internal.example.com/dify/dify-api");
    });
  });

  describe("upgrade to 3.7.4", () => {
    const template374 = () => readFixture("templates/374.yaml");
    const images374 = () => YAML.parse(readFixture("images/374.yaml")) as ImageMap;
    const resolveExpectedTags = (images: ImageMap) => ({
      api: images.api?.tag ?? null,
      web: images.web?.tag ?? null,
      sandbox: images.sandbox?.tag ?? null,
      enterprise: images.enterprise?.tag ?? null,
      logo: images["web.logoConfig"]?.tag ?? null,
    });

    it("upgrades official 3.7.3 values with custom overrides to 3.7.4", () => {
      const overrides = readFixture("values-373-official-custom.yaml");
      const template = template374();
      const images = images374();
      const templateParsed = YAML.parse(template) as Record<string, any>;
      const expectedTags = resolveExpectedTags(images);

      const { updatedYaml, changes } = mergeImageOverridesIntoTemplate(
        overrides,
        template,
        images,
      );
      const parsed = YAML.parse(updatedYaml) as Record<string, any>;

      expect(changes.length).toBeGreaterThan(0);
      expect(changes.some((c) => c.status === "missing")).toBe(false);
      expect(parsed.api.image.tag).toBe(expectedTags.api);
      expect(parsed.web.image.tag).toBe(expectedTags.web);
      expect(parsed.sandbox.image.tag).toBe(expectedTags.sandbox);
      expect(parsed.enterprise.image.tag).toBe(expectedTags.enterprise);
      expect(parsed.web.logoConfig.image.tag).toBe(expectedTags.logo);
      expect(parsed.api.image.repository).toBe(
        "registry.internal.example.com/dify/dify-api",
      );
      expect(parsed.web.image.repository).toBe(
        "registry.internal.example.com/dify/dify-web",
      );
      expect(parsed.sandbox.image.repository).toBe(
        "registry.internal.example.com/dify/dify-sandbox",
      );
      Object.keys(templateParsed).forEach((key) => {
        expect(parsed).toHaveProperty(key);
      });
      expect(updatedYaml).toContain("# Web overrides for internal registry");
      expect(updatedYaml).toContain("# Custom registry");
      expect(updatedYaml).toContain("# Using private sandbox registry");
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

    it("updates tags in-place when applying direct updates", () => {
      const input = `
api:
  image:
    tag: "0.10.0"
web:
  tag: "0.10.0"
`;
      const imageMap = {
        api: { tag: "0.11.0" },
        web: { tag: "0.12.0" },
      };

      const { updatedYaml, changes } = applyImageTagUpdates(input, imageMap);
      const parsed = YAML.parse(updatedYaml) as Record<string, { image?: { tag: string }; tag?: string }>;

      expect(changes.some((c) => c.status === "updated")).toBe(true);
      expect(parsed.api.image?.tag).toBe("0.11.0");
      expect(parsed.web.tag).toBe("0.12.0");
    });

    it("quotes numeric tag values when applying direct updates", () => {
      const input = readFixture("values-373-official.yaml");
      const imageMap = {
        api: { tag: "1.0" },
      };

      const { updatedYaml } = applyImageTagUpdates(input, imageMap);
      const parsed = YAML.parse(updatedYaml) as Record<string, { image: { tag: string } }>;

      expect(updatedYaml).toContain('tag: "1.0"');
      expect(parsed.api.image.tag).toBe("1.0");
    });
  });
});
