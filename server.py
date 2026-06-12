"""
Knit Assistant — minimal server
Serves the static frontend + Claude feedback widget API endpoints.
"""
import json
import sqlite3
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE = Path(__file__).parent
DB_FILE = BASE / "knit_assistant.db"
CLAUDE_INBOX = BASE / "claude_inbox.json"
STATE_FILE = BASE / "knit_state.json"
STATE_BACKUP_DIR = BASE / "state_backups"

app = FastAPI()


# ── Database ──────────────────────────────────────────────────────────────────

def get_conn():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(conn):
    conn.execute("""CREATE TABLE IF NOT EXISTS claude_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        element_context TEXT DEFAULT '',
        feedback TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        claude_note TEXT DEFAULT '',
        user_reply TEXT DEFAULT '',
        created_at TEXT,
        updated_at TEXT
    )""")
    conn.commit()


# ── Static files ──────────────────────────────────────────────────────────────

@app.get("/")
def serve_index():
    return FileResponse(BASE / "index.html")

@app.get("/app.js")
def serve_appjs():
    return FileResponse(BASE / "app.js")

@app.get("/styles.css")
def serve_css():
    return FileResponse(BASE / "styles.css")

@app.get("/feedback.js")
def serve_feedbackjs():
    return FileResponse(BASE / "feedback.js")

@app.get("/manifest.json")
def serve_manifest():
    return FileResponse(BASE / "manifest.json")

@app.get("/sw.js")
def serve_sw():
    return FileResponse(BASE / "sw.js")

@app.get("/widget.js")
def serve_widget():
    return FileResponse(BASE / "widget.js")

@app.get("/icons/{filename}")
def serve_icon(filename: str):
    p = BASE / "icons" / filename
    if not p.exists():
        raise HTTPException(404)
    return FileResponse(p)


# ── App state persistence ─────────────────────────────────────────────────────
# Single source of truth for the user's projects/progress/chat. Lives in a JSON
# file on the PC so every device + context (Safari, home-screen app) shares it.

@app.get("/api/state")
def get_state():
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


@app.put("/api/state")
async def put_state(request: Request):
    body = await request.json()
    try:
        STATE_BACKUP_DIR.mkdir(exist_ok=True)
        # Permanent backup of the very first non-empty state we ever receive —
        # never overwritten, so the original data can always be recovered.
        first = STATE_BACKUP_DIR / "first-capture.json"
        if not first.exists() and body.get("projects"):
            first.write_text(json.dumps(body, ensure_ascii=False), encoding="utf-8")
        # Rotating backup of the previous state before overwriting it.
        if STATE_FILE.exists():
            ts = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
            (STATE_BACKUP_DIR / f"state-{ts}.json").write_text(
                STATE_FILE.read_text(encoding="utf-8"), encoding="utf-8"
            )
            backups = sorted(STATE_BACKUP_DIR.glob("state-*.json"))
            for old in backups[:-20]:
                old.unlink(missing_ok=True)
    except Exception:
        pass
    # Atomic write so a crash mid-write can't corrupt the state file.
    tmp = STATE_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(body, ensure_ascii=False), encoding="utf-8")
    tmp.replace(STATE_FILE)
    return {"ok": True}


# ── Claude tasks API ──────────────────────────────────────────────────────────

class TaskCreate(BaseModel):
    element_context: str = ""
    feedback: str

class TaskUpdate(BaseModel):
    status: str
    claude_note: str = ""

class TaskReply(BaseModel):
    reply: str


@app.post("/api/claude-tasks")
def create_task(body: TaskCreate):
    conn = get_conn(); init_db(conn)
    now = datetime.utcnow().isoformat()
    cur = conn.execute(
        "INSERT INTO claude_tasks (element_context, feedback, created_at, updated_at) VALUES (?,?,?,?)",
        (body.element_context, body.feedback, now, now),
    )
    conn.commit()
    task_id = cur.lastrowid
    conn.close()
    CLAUDE_INBOX.write_text(json.dumps({"task_id": task_id, "ts": now, "app": "knit-assistant"}))
    return {"id": task_id, "ok": True}


@app.get("/api/claude-tasks")
def list_tasks():
    conn = get_conn(); init_db(conn)
    rows = conn.execute("SELECT * FROM claude_tasks ORDER BY created_at DESC LIMIT 30").fetchall()
    conn.close()
    return {"tasks": [dict(r) for r in rows]}


@app.patch("/api/claude-tasks/{task_id}")
def patch_task(task_id: int, body: TaskUpdate):
    conn = get_conn(); init_db(conn)
    now = datetime.utcnow().isoformat()
    if body.claude_note:
        conn.execute(
            "UPDATE claude_tasks SET status=?, claude_note=?, updated_at=? WHERE id=?",
            (body.status, body.claude_note, now, task_id),
        )
    else:
        conn.execute(
            "UPDATE claude_tasks SET status=?, updated_at=? WHERE id=?",
            (body.status, now, task_id),
        )
    conn.commit(); conn.close()
    return {"ok": True}


@app.post("/api/claude-tasks/{task_id}/reply")
async def reply_to_task(task_id: int, request: Request):
    body = await request.json()
    reply = (body.get("reply") or "").strip()
    if not reply:
        raise HTTPException(400, "reply text required")
    conn = get_conn(); init_db(conn)
    now = datetime.utcnow().isoformat()
    conn.execute(
        "UPDATE claude_tasks SET user_reply=?, status='pending', updated_at=? WHERE id=?",
        (reply, now, task_id),
    )
    conn.commit(); conn.close()
    CLAUDE_INBOX.write_text(json.dumps({"task_id": task_id, "reply": reply, "ts": now, "app": "knit-assistant"}))
    return {"ok": True}
