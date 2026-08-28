# ============================================================
# GET /api/garmin-data
# Returns today's Garmin Connect step count plus the last 7 days, using a
# pre-authenticated OAuth token stored server-side (never a live password).
#
# Garmin has no public consumer OAuth like WHOOP's developer platform, so
# this uses the unofficial `garminconnect` client (same one garmin_mcp-main
# vendors) against a token generated ONCE, locally, via that project's own
# `garmin-mcp-auth` CLI — see README section "Connecting Garmin" for the
# one-time setup. The token is a zip of garminconnect's token directory,
# base64-encoded into the GARMIN_TOKENS_B64 env var (Vercel project
# settings). Tokens last ~6 months before needing to be regenerated.
# ============================================================

import base64
import io
import json
import os
import tempfile
import zipfile
from datetime import date, timedelta
from http.server import BaseHTTPRequestHandler

from garminconnect import Garmin


def _load_client():
    blob = os.environ.get("GARMIN_TOKENS_B64")
    if not blob:
        raise RuntimeError("GARMIN_TOKENS_B64 is not configured")
    raw = base64.b64decode(blob)
    token_dir = tempfile.mkdtemp(prefix="garmin_tok_")
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        zf.extractall(token_dir)
    garmin = Garmin(is_cn=False)
    garmin.login(token_dir)
    return garmin


def _fetch_steps():
    garmin = _load_client()
    end = date.today()
    start = end - timedelta(days=7)
    daily = garmin.get_daily_steps(start.isoformat(), end.isoformat()) or []
    history = [
        {"date": d.get("calendarDate"), "steps": d.get("totalSteps"), "goal": d.get("stepGoal")}
        for d in daily
        if d.get("calendarDate")
    ]
    today_key = end.isoformat()
    today = next((h for h in history if h["date"] == today_key), None)
    return {"today": today, "history": history}


class handler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        try:
            self._send(200, _fetch_steps())
        except Exception as e:
            self._send(500, {"error": str(e)})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.end_headers()
