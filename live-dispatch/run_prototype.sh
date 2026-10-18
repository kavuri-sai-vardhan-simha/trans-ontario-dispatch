#!/usr/bin/env bash
# Trans Ontario live dispatch prototype (Mac / Linux). Needs Python 3.10+ and internet for the map.
set -e
cd "$(dirname "$0")/backend"
python3 -m pip install -q -r requirements.txt
echo
echo "  Dispatcher : http://localhost:8000/dispatch"
echo "  Elite desk : http://localhost:8000/elite"
echo "  Driver     : http://localhost:8000/driver"
echo "  Plan       : http://localhost:8000/plan"
echo "  Audience   : http://localhost:8000/book   (or press 'Audience QR' in the dispatcher)"
echo
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
