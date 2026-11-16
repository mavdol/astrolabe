#!/usr/bin/env bash
set -eu
cp -R "$(dirname "$0")/files/." .
node scripts/make-orders.mjs
bash "$(dirname "$0")/../_shared/install-astrolabe.sh"
