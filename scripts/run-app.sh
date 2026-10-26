#!/bin/bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$project_dir/artifacts"
log_path="$project_dir/artifacts/runtime-$(date +%Y%m%d-%H%M%S).log"
open -n -W --stdout "$log_path" --stderr "$log_path" "$project_dir/dist/Endfield Cloud.app"
