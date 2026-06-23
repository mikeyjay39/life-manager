#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

"${ROOT}/backend/scripts/write_rev.sh"
cargo test export_typescript_bindings --workspace --manifest-path "${ROOT}/backend/Cargo.toml"
