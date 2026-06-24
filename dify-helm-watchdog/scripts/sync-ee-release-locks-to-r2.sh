#!/usr/bin/env bash
set -euo pipefail

# Run this on a machine whose GitHub identity can read langgenius/ee-release.
# Requires:
#   - gh
#   - either awscli + R2 S3 keys, or wrangler + CLOUDFLARE_API_TOKEN

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${EE_RELEASE_LOCKS_ENV:-$SCRIPT_DIR/.sync-ee-release-locks.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi

OWNER="${EE_RELEASE_OWNER:-langgenius}"
REPO="${EE_RELEASE_REPO:-ee-release}"
PREFIX="${EE_RELEASE_LOCKS_PREFIX:-helm-watchdog/release-locks}"

DRY_RUN=""
FORCE=""
while (($#)); do
  case "$1" in
    --dry-run)
      DRY_RUN="--dryrun"
      shift
      ;;
    --force)
      FORCE="1"
      shift
      ;;
    --)
      shift
      break
      ;;
    -*)
      echo "unknown option: $1" >&2
      exit 1
      ;;
    *)
      break
      ;;
  esac
done

if (($#)); then
  versions=("$@")
else
  if ! command -v gh >/dev/null 2>&1; then
    echo "missing gh; install GitHub CLI and run gh auth login" >&2
    exit 1
  fi

  versions=()
  while IFS= read -r version; do
    versions+=("$version")
  done < <(
    gh api "repos/$OWNER/$REPO/tags" --paginate --jq '.[].name' |
      awk -F. '{
        major = $1
        sub(/^v/, "", major)
        if ((major + 0 > 3 || (major + 0 == 3 && $2 + 0 >= 9)) && $3 ~ /^[0-9]+$/) print $0
      }'
  )
fi

if ((${#versions[@]} == 0)); then
  echo "no release tags found; check GitHub auth for $OWNER/$REPO" >&2
  exit 1
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

with_cloudflare_account() {
  export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-${R2_ACCOUNT_ID:-}}"
  if [[ -z "$CLOUDFLARE_ACCOUNT_ID" ]]; then
    echo "missing CLOUDFLARE_ACCOUNT_ID or R2_ACCOUNT_ID" >&2
    exit 1
  fi
}

object_exists() {
  local key="$1"

  if [[ -n "${R2_PUBLIC_BASE_URL:-}" ]]; then
    curl -fsI "${R2_PUBLIC_BASE_URL%/}/$key" >/dev/null 2>&1
    return
  fi

  if [[ -n "${R2_ACCESS_KEY_ID:-}" && -n "${R2_SECRET_ACCESS_KEY:-}" ]]; then
    export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-$R2_ACCESS_KEY_ID}"
    export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-$R2_SECRET_ACCESS_KEY}"
    export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"
    local endpoint="${R2_ENDPOINT:-https://${R2_ACCOUNT_ID:?missing R2_ACCOUNT_ID}.r2.cloudflarestorage.com}"
    aws --endpoint-url "$endpoint" s3api head-object \
      --bucket "${R2_BUCKET:?missing R2_BUCKET}" \
      --key "$key" >/dev/null 2>&1
    return
  fi

  if [[ -n "${CLOUDFLARE_API_TOKEN:-}" ]]; then
    with_cloudflare_account
    wrangler r2 object get "${R2_BUCKET:?missing R2_BUCKET}/$key" \
      --pipe \
      --remote >/dev/null 2>&1
    return
  fi

  return 1
}

upload() {
  local file="$1"
  local key="$2"

  if [[ -n "${R2_ACCESS_KEY_ID:-}" && -n "${R2_SECRET_ACCESS_KEY:-}" ]]; then
    export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-$R2_ACCESS_KEY_ID}"
    export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-$R2_SECRET_ACCESS_KEY}"
    export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"
    local endpoint="${R2_ENDPOINT:-https://${R2_ACCOUNT_ID:?missing R2_ACCOUNT_ID}.r2.cloudflarestorage.com}"
    aws --endpoint-url "$endpoint" s3 cp "$file" \
      "s3://${R2_BUCKET:?missing R2_BUCKET}/$key" \
      --content-type application/yaml \
      $DRY_RUN
    return
  fi

  if [[ -n "${CLOUDFLARE_API_TOKEN:-}" ]]; then
    with_cloudflare_account
    if [[ -n "$DRY_RUN" ]]; then
      echo "[dry-run] wrangler r2 object put ${R2_BUCKET:?missing R2_BUCKET}/$key"
      return
    fi
    wrangler r2 object put "${R2_BUCKET:?missing R2_BUCKET}/$key" \
      --file "$file" \
      --content-type application/yaml \
      --remote
    return
  fi

  echo "missing R2 credentials: set R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY or CLOUDFLARE_API_TOKEN" >&2
  exit 1
}

seen=0
skipped=0
synced=0

for version in "${versions[@]}"; do
  ((seen += 1))
  clean_version="${version#v}"
  key="$PREFIX/$clean_version.yaml"

  if [[ -z "$FORCE" ]] && object_exists "$key"; then
    ((skipped += 1))
    echo "[skip] $version already synced"
    continue
  fi

  if [[ -n "$DRY_RUN" ]]; then
    echo "[dry-run] sync $version -> $key"
    continue
  fi

  echo "[sync] $version -> $key"
  out="$tmpdir/$clean_version.yaml"
  gh api "repos/$OWNER/$REPO/contents/versions.lock.yaml?ref=$version" \
    -H "Accept: application/vnd.github.raw" >"$out"

  upload "$out" "$key"
  ((synced += 1))
done

echo "[done] checked=$seen skipped=$skipped synced=$synced"
