import YAML from "yaml";

export interface ImageTagEntry {
  repository?: string;
  tag?: string;
}

export interface TagChange {
  key: string;
  path: string;
  repository?: string;
  oldTag: string | null;
  newTag: string;
  status: "updated" | "unchanged" | "missing";
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeScalar = (value: unknown): string | null => {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
};

/**
 * Normalize user-provided YAML text so it's more likely to parse consistently across editors/OSes.
 * - Remove UTF-8 BOM
 * - Normalize CRLF to LF
 * - Replace indentation tabs (leading tabs) with two spaces per tab
 */
export const normalizeYamlInput = (raw: string): string => {
  const withoutBom = raw.replace(/^\uFEFF/, "");
  const normalizedNewlines = withoutBom.replace(/\r\n/g, "\n");
  // Only replace indentation tabs at the beginning of a line (tabs inside block scalars are valid).
  return normalizedNewlines.replace(/^\t+(?=\S)/gm, (tabs) =>
    "  ".repeat(tabs.length),
  );
};

export interface ApplyImageTagUpdatesResult {
  changes: TagChange[];
  updatedYaml: string;
}

const parseYamlDocument = (rawYaml: string): YAML.Document.Parsed => {
  const normalizedYaml = normalizeYamlInput(rawYaml);
  const doc = YAML.parseDocument(normalizedYaml, {
    // Be tolerant to duplicate keys in user overrides (common in hand-edited YAML).
    uniqueKeys: false,
  });
  if (doc.errors.length > 0) {
    throw doc.errors[0];
  }
  return doc;
};

type YamlPathSegment = string | number;

const keyToYamlPathSegments = (key: string): YamlPathSegment[] =>
  key
    .split(".")
    .map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment));

const getScalarIn = (
  doc: YAML.Document.Parsed,
  path: YamlPathSegment[],
): string | null => {
  if (!doc.hasIn(path)) {
    return null;
  }
  return normalizeScalar(doc.getIn(path));
};

const pickTagPathForTemplate = (
  templateDoc: YAML.Document.Parsed,
  segments: YamlPathSegment[],
): YamlPathSegment[] => {
  const imagePath = [...segments, "image", "tag"];
  const directPath = [...segments, "tag"];
  if (templateDoc.hasIn(imagePath)) {
    return imagePath;
  }
  if (templateDoc.hasIn(directPath)) {
    return directPath;
  }
  // Fallback to the Helm convention.
  return imagePath;
};

const pickRepositoryPathForTemplate = (
  templateDoc: YAML.Document.Parsed,
  segments: YamlPathSegment[],
): YamlPathSegment[] => {
  const imagePath = [...segments, "image", "repository"];
  const directPath = [...segments, "repository"];
  if (templateDoc.hasIn(imagePath)) {
    return imagePath;
  }
  if (templateDoc.hasIn(directPath)) {
    return directPath;
  }
  // Fallback to the Helm convention.
  return imagePath;
};

const findRepositoryOverride = (
  overridesDoc: YAML.Document.Parsed,
  segments: YamlPathSegment[],
): string | null => {
  const imagePath = [...segments, "image", "repository"];
  const directPath = [...segments, "repository"];
  return getScalarIn(overridesDoc, imagePath) ?? getScalarIn(overridesDoc, directPath);
};

/**
 * Merge user overrides into a template values.yaml:
 * - Always enforce the latest tag from the provided image map
 * - Reuse the repository from user overrides if present (otherwise keep template)
 * - Ensure missing services/paths in overrides still exist in the output by starting from template
 */
export const mergeImageOverridesIntoTemplate = (
  overridesYaml: string,
  templateYaml: string,
  imageMap: Record<string, ImageTagEntry>,
): ApplyImageTagUpdatesResult => {
  const templateDoc = parseYamlDocument(templateYaml);
  const overridesDoc = parseYamlDocument(overridesYaml);

  const changes: TagChange[] = [];

  for (const [key, entry] of Object.entries(imageMap)) {
    if (!isRecord(entry)) {
      continue;
    }

    const nextTag = normalizeScalar(entry.tag);
    if (!nextTag) {
      continue;
    }

    const segments = keyToYamlPathSegments(key);
    const tagPath = pickTagPathForTemplate(templateDoc, segments);
    const repositoryPath = pickRepositoryPathForTemplate(templateDoc, segments);

    let status: TagChange["status"] = "missing";
    let previousTag: string | null = null;
    let effectiveRepository: string | undefined;

    try {
      previousTag = getScalarIn(templateDoc, tagPath);
      templateDoc.setIn(tagPath, nextTag);
      status = previousTag === nextTag ? "unchanged" : "updated";

      const overrideRepository = findRepositoryOverride(overridesDoc, segments);
      if (overrideRepository) {
        try {
          templateDoc.setIn(repositoryPath, overrideRepository);
        } catch {
          // If repository cannot be set due to incompatible YAML structure, keep the template.
        }
      }

      const repoFromDoc = getScalarIn(templateDoc, repositoryPath);
      effectiveRepository =
        repoFromDoc ?? normalizeScalar((entry as ImageTagEntry).repository) ?? undefined;
    } catch {
      status = "missing";
      previousTag = getScalarIn(templateDoc, tagPath);
      effectiveRepository =
        getScalarIn(templateDoc, repositoryPath) ??
        normalizeScalar((entry as ImageTagEntry).repository) ??
        undefined;
    }

    changes.push({
      key,
      path: tagPath.join("."),
      repository: effectiveRepository,
      oldTag: previousTag,
      newTag: nextTag,
      status,
    });
  }

  return {
    changes,
    updatedYaml: templateDoc.toString(),
  };
};

export const applyImageTagUpdates = (
  rawYaml: string,
  imageMap: Record<string, ImageTagEntry>,
): ApplyImageTagUpdatesResult => {
  const normalizedYaml = normalizeYamlInput(rawYaml);

  const doc = YAML.parseDocument(normalizedYaml, {
    // Be tolerant to duplicate keys in user overrides (common in hand-edited YAML).
    uniqueKeys: false,
  });
  if (doc.errors.length > 0) {
    throw doc.errors[0];
  }

  const changes: TagChange[] = [];

  for (const [key, entry] of Object.entries(imageMap)) {
    if (!isRecord(entry)) {
      continue;
    }

    const nextTag = normalizeScalar(entry.tag);
    if (!nextTag) {
      continue;
    }

    // Support YAML sequences: numeric path segments should be numbers, not strings.
    const segments = key
      .split(".")
      .map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment));

    const imagePath = [...segments, "image", "tag"] as Array<string | number>;
    const directPath = [...segments, "tag"] as Array<string | number>;

    let status: TagChange["status"] = "missing";
    let previousValue: string | null = null;
    let usedPath: Array<string | number> | null = null;

    if (doc.hasIn(imagePath)) {
      const current = doc.getIn(imagePath);
      previousValue = normalizeScalar(current);
      doc.setIn(imagePath, nextTag);
      status = previousValue === nextTag ? "unchanged" : "updated";
      usedPath = imagePath;
    } else if (doc.hasIn(directPath)) {
      const current = doc.getIn(directPath);
      previousValue = normalizeScalar(current);
      doc.setIn(directPath, nextTag);
      status = previousValue === nextTag ? "unchanged" : "updated";
      usedPath = directPath;
    }

    changes.push({
      key,
      path: (usedPath ?? imagePath).join("."),
      repository: normalizeScalar((entry as ImageTagEntry).repository) ?? undefined,
      oldTag: previousValue,
      newTag: nextTag,
      status,
    });
  }

  return {
    changes,
    updatedYaml: doc.toString(),
  };
};

export const formatYamlError = (thrown: unknown): string => {
  if (!(thrown instanceof Error)) {
    return "Failed to process the uploaded values.yaml file.";
  }

  const anyError = thrown as Error & {
    linePos?: Array<{ line: number; col: number }>;
    pos?: number[];
  };

  const parts = [thrown.message];
  if (Array.isArray(anyError.linePos) && anyError.linePos.length > 0) {
    const first = anyError.linePos[0];
    parts.push(`(line ${first.line}, col ${first.col})`);
  }
  return parts.join(" ");
};



