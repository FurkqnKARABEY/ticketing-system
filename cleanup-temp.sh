#!/bin/sh
set -eu

TEMP_DIR="${TEMP_DIR:-/var/tmp/ticketing-system}"
MAX_AGE_MINUTES="${MAX_AGE_MINUTES:-1440}"

mkdir -p "$TEMP_DIR"
find "$TEMP_DIR" -type f -mmin +"$MAX_AGE_MINUTES" -delete
find "$TEMP_DIR" -type d -empty -mindepth 1 -delete
