export class MissingStorageCredentialsError extends Error {
  constructor(missing?: readonly string[]) {
    const detail = missing && missing.length > 0
      ? ` Missing: ${missing.join(", ")}.`
      : "";
    super(
      `Storage credentials are not configured. Please set the R2_* environment variables before triggering the cron job.${detail}`,
    );
    this.name = "MissingStorageCredentialsError";
  }
}
