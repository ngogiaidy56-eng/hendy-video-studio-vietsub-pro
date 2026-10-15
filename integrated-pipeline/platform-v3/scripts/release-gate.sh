#!/usr/bin/env bash
set -euo pipefail
: "${PIPELINE_RESULT_JSON:?Set PIPELINE_RESULT_JSON to a pipeline result JSON file}"
python3 - <<'PY'
import json, os, sys
path=os.environ['PIPELINE_RESULT_JSON']
data=json.load(open(path,encoding='utf-8'))
status=data.get('status')
verdict=data.get('verdict')
if status != 'NOMINAL' or verdict != 'RELEASE_UNLOCKED':
    print(f'RELEASE BLOCKED: status={status!r} verdict={verdict!r}')
    sys.exit(1)
print('RELEASE GATE: NOMINAL / RELEASE_UNLOCKED')
PY
