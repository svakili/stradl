#!/usr/bin/env bash
set -euo pipefail

OWNER="${STRADL_UPDATE_OWNER:-svakili}"
REPO="${STRADL_UPDATE_REPO:-stradl}"
ARCHIVE_PATH=""
CHECKSUMS_PATH=""
VERSION=""
DATA_DIR="${STRADL_DATA_DIR:-$HOME/Library/Application Support/Stradl}"
RUNTIME_ROOT="${STRADL_RUNTIME_ROOT:-$DATA_DIR/runtime}"
OPEN_BROWSER=1

usage() {
  cat <<'EOF'
Usage: install-stradl.sh [options]

Options:
  --archive <path>       Install from a local runtime archive instead of GitHub Releases.
  --checksums <path>     Local SHA256SUMS.txt to verify a local archive.
  --version <version>    Version to install when using a local archive.
  --owner <owner>        GitHub owner to download releases from.
  --repo <repo>          GitHub repo to download releases from.
  --data-dir <path>      Override the Stradl data directory.
  --runtime-root <path>  Override the managed runtime directory.
  --no-open              Do not open the browser after installation.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --archive)
      ARCHIVE_PATH="$2"
      shift 2
      ;;
    --checksums)
      CHECKSUMS_PATH="$2"
      shift 2
      ;;
    --version)
      VERSION="$2"
      shift 2
      ;;
    --owner)
      OWNER="$2"
      shift 2
      ;;
    --repo)
      REPO="$2"
      shift 2
      ;;
    --data-dir)
      DATA_DIR="$2"
      shift 2
      ;;
    --runtime-root)
      RUNTIME_ROOT="$2"
      shift 2
      ;;
    --no-open)
      OPEN_BROWSER=0
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "Node.js is required to run Stradl. Install Node 18+ and try again." >&2
  exit 1
fi

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/stradl-install-XXXXXX")"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

if [[ -z "$ARCHIVE_PATH" ]]; then
  RELEASE_JSON_PATH="$TMP_DIR/release.json"
  curl -fsSL "https://api.github.com/repos/$OWNER/$REPO/releases/latest" -o "$RELEASE_JSON_PATH"

  VERSION="$("$NODE_BIN" -e '
    const fs = require("fs");
    const release = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (typeof release.tag_name !== "string") {
      process.exit(1);
    }
    process.stdout.write(release.tag_name.replace(/^v/i, "").trim());
  ' "$RELEASE_JSON_PATH")"

  ARCHIVE_NAME="Stradl-runtime-v${VERSION}.tar.gz"
  ARCHIVE_URL="$("$NODE_BIN" -e '
    const fs = require("fs");
    const [releasePath, assetName] = process.argv.slice(1);
    const release = JSON.parse(fs.readFileSync(releasePath, "utf8"));
    const asset = Array.isArray(release.assets)
      ? release.assets.find((entry) => entry && entry.name === assetName)
      : null;
    if (!asset || typeof asset.browser_download_url !== "string") {
      process.exit(1);
    }
    process.stdout.write(asset.browser_download_url);
  ' "$RELEASE_JSON_PATH" "$ARCHIVE_NAME")"

  CHECKSUMS_URL="$("$NODE_BIN" -e '
    const fs = require("fs");
    const release = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const asset = Array.isArray(release.assets)
      ? release.assets.find((entry) => entry && entry.name === "SHA256SUMS.txt")
      : null;
    if (!asset || typeof asset.browser_download_url !== "string") {
      process.exit(1);
    }
    process.stdout.write(asset.browser_download_url);
  ' "$RELEASE_JSON_PATH")"

  ARCHIVE_PATH="$TMP_DIR/$ARCHIVE_NAME"
  CHECKSUMS_PATH="$TMP_DIR/SHA256SUMS.txt"
  curl -fsSL "$ARCHIVE_URL" -o "$ARCHIVE_PATH"
  curl -fsSL "$CHECKSUMS_URL" -o "$CHECKSUMS_PATH"
else
  ARCHIVE_PATH="$(cd "$(dirname "$ARCHIVE_PATH")" && pwd)/$(basename "$ARCHIVE_PATH")"

  if [[ -z "$VERSION" ]]; then
    ARCHIVE_BASENAME="$(basename "$ARCHIVE_PATH")"
    if [[ "$ARCHIVE_BASENAME" =~ ^Stradl-runtime-v([0-9]+\.[0-9]+\.[0-9]+)\.tar\.gz$ ]]; then
      VERSION="${BASH_REMATCH[1]}"
    else
      echo "Unable to infer version from $ARCHIVE_BASENAME. Pass --version explicitly." >&2
      exit 1
    fi
  fi

  if [[ -z "$CHECKSUMS_PATH" ]]; then
    LOCAL_CHECKSUMS="$(dirname "$ARCHIVE_PATH")/SHA256SUMS.txt"
    if [[ -f "$LOCAL_CHECKSUMS" ]]; then
      CHECKSUMS_PATH="$LOCAL_CHECKSUMS"
    fi
  fi
fi

if [[ -z "$CHECKSUMS_PATH" || ! -f "$CHECKSUMS_PATH" ]]; then
  echo "SHA256SUMS.txt is required to verify the runtime archive." >&2
  exit 1
fi

VERIFY_FILE="$TMP_DIR/checksum.txt"
ARCHIVE_BASENAME="$(basename "$ARCHIVE_PATH")"
grep -F "  $ARCHIVE_BASENAME" "$CHECKSUMS_PATH" > "$VERIFY_FILE" || {
  echo "Checksum entry for $ARCHIVE_BASENAME not found in $CHECKSUMS_PATH." >&2
  exit 1
}

(
  cd "$(dirname "$ARCHIVE_PATH")"
  shasum -a 256 -c "$VERIFY_FILE"
)

mkdir -p "$RUNTIME_ROOT/versions"

RUNTIME_DIR_NAME="$(tar -tzf "$ARCHIVE_PATH" | head -1 | cut -d/ -f1)"
if [[ -z "$RUNTIME_DIR_NAME" ]]; then
  echo "Failed to inspect $ARCHIVE_PATH." >&2
  exit 1
fi

TARGET_RUNTIME_DIR="$RUNTIME_ROOT/versions/$RUNTIME_DIR_NAME"
if [[ ! -d "$TARGET_RUNTIME_DIR" ]]; then
  tar -xzf "$ARCHIVE_PATH" -C "$RUNTIME_ROOT/versions"
fi

ln -sfn "$TARGET_RUNTIME_DIR" "$RUNTIME_ROOT/current"

INSTALL_ARGS=(
  "$NODE_BIN"
  "$RUNTIME_ROOT/current/scripts/install-service.js"
  "--runtime-root" "$RUNTIME_ROOT"
  "--data-dir" "$DATA_DIR"
)

if [[ "$OPEN_BROWSER" -eq 1 ]]; then
  INSTALL_ARGS+=("--open-browser")
fi

"${INSTALL_ARGS[@]}"

echo "Installed Stradl v$VERSION to $RUNTIME_ROOT/current"
