import type {
  ImageValidationPayload,
  ImageValidationRecord,
  ImageVariantCheck,
  ImageVariantName,
  ImageVariantStatus,
} from "@/lib/types";

const normalizeTimestamp = (value?: string | null): string | undefined => {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
};

const normalizeVariantName = (value: unknown): ImageVariantName => {
  const name = String(value ?? "").toUpperCase();
  if (name === "ORIGINAL" || name === "AMD64" || name === "ARM64") {
    return name as ImageVariantName;
  }
  return "ORIGINAL";
};

const normalizeVariantStatus = (value: unknown): ImageVariantStatus => {
  const status = String(value ?? "").toUpperCase();
  if (status === "FOUND" || status === "MISSING" || status === "ERROR") {
    return status as ImageVariantStatus;
  }
  return "ERROR";
};

export const normalizeValidationVariant = (
  variant: ImageVariantCheck | (ImageVariantCheck & { checkedAt?: string }),
): ImageVariantCheck => {
  const rawCheckTime =
    (variant as { checkTime?: string; checkedAt?: string }).checkTime ??
    (variant as { checkTime?: string; checkedAt?: string }).checkedAt ??
    null;
  const normalizedCheckTime = normalizeTimestamp(rawCheckTime);

  return {
    name: normalizeVariantName(variant.name),
    tag: String(variant.tag ?? ""),
    image: String(variant.image ?? ""),
    status: normalizeVariantStatus(variant.status),
    checkTime: normalizedCheckTime ?? new Date().toISOString(),
    ...(typeof variant.httpStatus === "number"
      ? { httpStatus: variant.httpStatus }
      : {}),
    ...(variant.error ? { error: String(variant.error) } : {}),
  };
};

const normalizeOverallStatus = (
  status: unknown,
): ImageValidationRecord["status"] => {
  const normalized = String(status ?? "").toUpperCase();
  if (
    normalized === "ALL_FOUND" ||
    normalized === "PARTIAL" ||
    normalized === "MISSING" ||
    normalized === "ERROR"
  ) {
    return normalized as ImageValidationRecord["status"];
  }
  return "ERROR";
};

export const normalizeValidationRecord = (
  record: ImageValidationRecord,
): ImageValidationRecord => {
  return {
    ...record,
    sourceRepository: String(record.sourceRepository ?? ""),
    sourceTag: String(record.sourceTag ?? ""),
    targetImageName: String(record.targetImageName ?? ""),
    paths: Array.isArray(record.paths)
      ? record.paths.map((path) => String(path))
      : [],
    variants: Array.isArray(record.variants)
      ? record.variants.map((variant) => normalizeValidationVariant(variant))
      : [],
    status: normalizeOverallStatus(record.status),
  };
};

export const normalizeValidationPayload = (
  payload: ImageValidationPayload,
): ImageValidationPayload => {
  const normalizedCheckTime = normalizeTimestamp(
    (payload as { checkTime?: string; checkedAt?: string }).checkTime ??
      (payload as { checkTime?: string; checkedAt?: string }).checkedAt ??
      null,
  );

  return {
    version: String(payload.version ?? ""),
    checkTime: normalizedCheckTime ?? new Date().toISOString(),
    host: String(payload.host ?? ""),
    namespace: String(payload.namespace ?? ""),
    images: Array.isArray(payload.images)
      ? payload.images.map((image) => normalizeValidationRecord(image))
      : [],
  };
};

export const countValidationStatuses = (
  images: ImageValidationRecord[],
): {
  total: number;
  allFound: number;
  partial: number;
  missing: number;
  error: number;
} => {
  const counts = {
    total: images.length,
    allFound: 0,
    partial: 0,
    missing: 0,
    error: 0,
  };

  for (const record of images) {
    const status = normalizeOverallStatus(record.status);
    switch (status) {
      case "ALL_FOUND":
        counts.allFound += 1;
        break;
      case "PARTIAL":
        counts.partial += 1;
        break;
      case "MISSING":
        counts.missing += 1;
        break;
      case "ERROR":
        counts.error += 1;
        break;
      default:
        break;
    }
  }

  return counts;
};
