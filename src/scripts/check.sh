#!/bin/sh
set -e
ts-node -P src/scripts/tsconfig.json src/scripts/check.ts "$@"
