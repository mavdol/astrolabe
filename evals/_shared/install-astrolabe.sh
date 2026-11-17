#!/usr/bin/env bash
# Installs the astrolabe command built from this repository into the run's workspace,
# as a project dependency would be: runs have no network, so npx cannot fetch it.
# Build first with `pnpm build` at the repository root.
set -eu
here="$(dirname "${BASH_SOURCE[0]}")"

# scripts/run-evals.sh runs the cases from a copy and writes where the repository is.
if [ -f "$here/repository-path" ]; then repository="$(cat "$here/repository-path")"; else repository="$(cd "$here/../.." && pwd)"; fi
package="node_modules/astrolabe-bench"

if [ ! -f "$repository/dist/cli/index.js" ]; then
  echo "astrolabe is not built: run pnpm build at the repository root" >&2
  exit 1
fi

mkdir -p "$package" node_modules/.bin
mkdir -p "$package/assets"
cp -R "$repository/dist" "$repository/schema" "$repository/package.json" "$package/"
cp -R "$repository/assets/fonts" "$repository/assets/site" "$package/assets/"

for dependency in zod @resvg; do
  mkdir -p "node_modules/$(dirname "$dependency")"
  cp -RL "$repository/node_modules/$dependency" "node_modules/$dependency"
done

for platform_binary in "$repository"/node_modules/.pnpm/@resvg+resvg-js-*/node_modules/@resvg/resvg-js-*; do
  [ -e "$platform_binary" ] && cp -RL "$platform_binary" "node_modules/@resvg/"
done

ln -sf ../astrolabe-bench/dist/cli/index.js node_modules/.bin/astrolabe
chmod +x "$package/dist/cli/index.js"
