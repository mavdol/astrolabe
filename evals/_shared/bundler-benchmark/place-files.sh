#!/usr/bin/env bash
# The storefront repository with its finished bundler benchmark, computed and built with astrolabe.
set -eu
here="$(dirname "${BASH_SOURCE[0]}")"
cp -R "$here/." .
rm place-files.sh
bash "$here/../install-astrolabe.sh"
