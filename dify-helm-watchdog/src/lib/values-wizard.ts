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


