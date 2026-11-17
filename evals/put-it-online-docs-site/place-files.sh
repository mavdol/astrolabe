#!/usr/bin/env bash
set -eu
bash "$(dirname "$0")/../_shared/bundler-benchmark/place-files.sh"
cp -R "$(dirname "$0")/files/." .
git init -q
git remote add origin https://github.com/example/storefront.git
