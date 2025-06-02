# test_launchd.py
from datetime import datetime
with open("/tmp/test_launchd.txt", "a") as f:
    f.write(f"🔁 Launchd körde testscriptet vid {datetime.utcnow().isoformat()}Z\n")