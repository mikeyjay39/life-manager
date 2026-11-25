#!/usr/bin/env bash
# Usage: scripts/setup-git-crypt.sh [<symmetric-key-file>]
#
# Unlocks git-crypt (when you give a key file) and makes every git worktree of this
# clone use the key of the main checkout. Run it one time after each clone.
# Idempotent: you can run it again at any time.
#
# Why: git-crypt 0.8 reads the key from the git dir of the current worktree
# (.git/worktrees/<name>/git-crypt/). A new linked worktree has no key there, so
# `git worktree add` fails on the smudge of .dev.env. The filters below read the key
# from the common git dir. The shell expands the path when git runs the filter, so
# the setting has no absolute path and stays correct when you move the clone.
#
#   setup-git-crypt.sh
#     |-- cd main checkout (git common dir parent)
#     |-- [key file given] git-crypt unlock <key>   (writes default filters)
#     |-- check .git/git-crypt/keys/default exists
#     `-- git config filter/diff git-crypt -> --key-file "$(git rev-parse --git-common-dir)/..."
set -euo pipefail

KEY_FILE="${1:-}"

fail() {
  echo "setup-git-crypt: $*" >&2
  exit 1
}

command -v git-crypt >/dev/null || fail 'git-crypt is not installed'

COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir)" ||
  fail 'run this from inside the life-manager clone'
cd "$(dirname "$COMMON_DIR")"

if [[ -n "$KEY_FILE" ]]; then
  [[ -r "$KEY_FILE" ]] || fail "cannot read key file: $KEY_FILE"
  # unlock writes the default filters, so it must run before the config below.
  git-crypt unlock "$KEY_FILE"
fi

[[ -r "$COMMON_DIR/git-crypt/keys/default" ]] ||
  fail 'repo is locked; run again with the key file: scripts/setup-git-crypt.sh <key-file>'

# Single quotes: git, not this script, expands the path each time it runs the filter.
KEY_ARG='--key-file "$(git rev-parse --git-common-dir)/git-crypt/keys/default"'
git config filter.git-crypt.smudge "git-crypt smudge $KEY_ARG"
git config filter.git-crypt.clean "git-crypt clean $KEY_ARG"
git config filter.git-crypt.required true
git config diff.git-crypt.textconv "git-crypt diff $KEY_ARG"

echo 'setup-git-crypt: done. New worktrees can decrypt git-crypt files.'
