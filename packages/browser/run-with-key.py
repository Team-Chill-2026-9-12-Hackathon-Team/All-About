"""macOS local launcher. Parse one credential in memory; never persist or echo it."""
import os
import re
import subprocess
import sys
from pathlib import Path

if len(sys.argv) not in (2, 3):
    raise SystemExit('Usage: python3 run-with-key.py /absolute/path/to/SteelKey.rtf [smoke|smoke:collect|smoke:cancel]')
script = sys.argv[2] if len(sys.argv) == 3 else 'smoke'
if script not in {'smoke', 'smoke:collect', 'smoke:cancel'}:
    raise SystemExit('Unsupported npm script.')
raw = subprocess.run(['/usr/bin/textutil', '-convert', 'txt', '-stdout', sys.argv[1]], capture_output=True, text=True, check=True).stdout
candidates = re.findall(r'\b(?:ste[-_]|steel[-_]|sk[-_])[A-Za-z0-9_-]{16,}', raw)
if not candidates:
    candidates = [line.strip() for line in raw.splitlines() if re.fullmatch(r'[A-Za-z0-9_-]{24,}', line.strip())]
if len(set(candidates)) != 1:
    raise SystemExit('No unambiguous credential found; check the source file locally.')
env = os.environ.copy()
env['STEEL_API_KEY'] = candidates[0]
raise SystemExit(subprocess.run(['npm', 'run', script], cwd=Path(__file__).resolve().parent, env=env).returncode)
