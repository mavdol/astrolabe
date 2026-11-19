#!/usr/bin/env bash
set -eu
cp -R "$(dirname "$0")/files/." .
node "$(dirname "$0")/make-logs.mjs"
bash "$(dirname "$0")/../_shared/install-astrolabe.sh"
