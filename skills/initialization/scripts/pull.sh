#!/usr/bin/env bash
cd "$(dirname "$0")"
node sync.cjs pull "$@"
