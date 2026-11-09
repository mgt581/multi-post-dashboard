"""Reject an Android bundle that omits the native workspace billing bridge."""
import argparse
import hashlib
import sys
import zipfile
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("bundle", type=Path)
args = parser.parse_args()
with zipfile.ZipFile(args.bundle) as bundle:
    dex = b"".join(bundle.read(name) for name in bundle.namelist() if name.endswith(".dex"))
required = [b"changeWorkspaces", b"onMultiPostWorkspacePlans", b"onMultiPostPlayCountry",
            b"multipost_workspace_%02d"]
missing = [marker.decode() for marker in required if marker not in dex]
if missing:
    print("Workspace billing is missing: " + ", ".join(missing), file=sys.stderr)
    sys.exit(1)
print("Workspace billing bridge present.")
print("SHA-256: " + hashlib.sha256(args.bundle.read_bytes()).hexdigest())
