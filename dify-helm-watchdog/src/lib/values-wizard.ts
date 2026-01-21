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

const setQuotedScalar = (
  doc: YAML.Document.Parsed,
  path: YamlPathSegment[],
  value: string,
): void => {
  const existingNode = doc.getIn(path, true);
  if (existingNode && YAML.isScalar(existingNode)) {
    existingNode.value = value;
    existingNode.type = "QUOTE_DOUBLE";
    return;
  }
  const tagNode = new YAML.Scalar(value);
  tagNode.type = "QUOTE_DOUBLE";
  doc.setIn(path, tagNode);
};

const mergeMissingFromTemplate = (
  templateNode: YAML.Node | null | undefined,
  targetNode: YAML.Node | null | undefined,
): void => {
  if (!templateNode || !targetNode) {
    return;
  }
  if (YAML.isMap(templateNode) && YAML.isMap(targetNode)) {
    for (const entry of templateNode.items) {
      const key =
        entry.key && YAML.isScalar(entry.key) ? entry.key.value : (entry.key as unknown);
      const targetValue = targetNode.get(key as string | number | undefined, true);
      if (typeof targetValue === "undefined") {
        targetNode.set(key as string | number, entry.value);
      } else if (entry.value) {
        mergeMissingFromTemplate(entry.value as YAML.Node, targetValue as YAML.Node);
      }
    }
    return;
  }
  if (YAML.isSeq(templateNode) && YAML.isSeq(targetNode)) {
    templateNode.items.forEach((item, index) => {
      const existing = targetNode.items[index];
      if (!existing) {
        targetNode.items[index] = item;
      } else {
        mergeMissingFromTemplate(item as YAML.Node, existing as YAML.Node);
      }
    });
  }
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
  return normalizedNewlines.replace(/^\t+/gm, (tabs) => "  ".repeat(tabs.length));
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
  const outputDoc = overridesDoc;

  if (!outputDoc.contents) {
    outputDoc.contents = templateDoc.contents;
  } else {
    mergeMissingFromTemplate(templateDoc.contents, outputDoc.contents);
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

    const segments = keyToYamlPathSegments(key);
    const tagPath = pickTagPathForTemplate(templateDoc, segments);
    const repositoryPath = pickRepositoryPathForTemplate(templateDoc, segments);

    let status: TagChange["status"] = "missing";
    let previousTag: string | null = null;
    let effectiveRepository: string | undefined;

    try {
      previousTag = getScalarIn(outputDoc, tagPath);
      setQuotedScalar(outputDoc, tagPath, nextTag);
      status = previousTag === nextTag ? "unchanged" : "updated";

      const overrideRepository = findRepositoryOverride(overridesDoc, segments);
      if (overrideRepository) {
        try {
          outputDoc.setIn(repositoryPath, overrideRepository);
        } catch {
          // If repository cannot be set due to incompatible YAML structure, keep the template.
        }
      }

      const repoFromDoc = getScalarIn(outputDoc, repositoryPath);
      effectiveRepository =
        repoFromDoc ?? normalizeScalar((entry as ImageTagEntry).repository) ?? undefined;
    } catch {
      status = "missing";
      previousTag = getScalarIn(outputDoc, tagPath);
      effectiveRepository =
        getScalarIn(outputDoc, repositoryPath) ??
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
    updatedYaml: outputDoc.toString(),
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
      setQuotedScalar(doc, imagePath, nextTag);
      status = previousValue === nextTag ? "unchanged" : "updated";
      usedPath = imagePath;
    } else if (doc.hasIn(directPath)) {
      const current = doc.getIn(directPath);
      previousValue = normalizeScalar(current);
      setQuotedScalar(doc, directPath, nextTag);
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



