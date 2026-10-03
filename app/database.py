"""
Database management for SafeGlow application.
Uses SQLite for robust, lightweight, zero-configuration local and production persistence.
"""

import sqlite3
import os
import json
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

DB_PATH = os.environ.get("SAFEGLOW_DB_PATH", os.path.join(os.path.dirname(__file__), "safeglow.db"))

def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initializes tables for sessions, locations, snapshots, and SOS logs."""
    os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Sessions table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                user_name TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active', -- 'active', 'sos', 'safe', 'ended'
                battery_level REAL DEFAULT 100,
                battery_charging INTEGER DEFAULT 0,
                destination TEXT DEFAULT '',
                custom_notes TEXT DEFAULT '',
                emergency_contacts TEXT DEFAULT '[]',
                created_at TEXT NOT NULL,
                last_active_at TEXT NOT NULL
            )
        """)
        
        # Location history (breadcrumbs)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS locations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                accuracy REAL DEFAULT 0,
                speed REAL DEFAULT 0,
                heading REAL DEFAULT 0,
                altitude REAL DEFAULT 0,
                timestamp TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_loc_session ON locations(session_id, timestamp)")

        # Camera snapshots
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                latitude REAL,
                longitude REAL,
                is_sos INTEGER DEFAULT 0,
                note TEXT DEFAULT '',
                timestamp TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_snap_session ON snapshots(session_id)")

        # SOS incident logs
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sos_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                latitude REAL,
                longitude REAL,
                status TEXT NOT NULL DEFAULT 'triggered', -- 'triggered', 'resolved', 'cancelled'
                triggered_at TEXT NOT NULL,
                resolved_at TEXT,
                notes TEXT DEFAULT '',
                FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
            )
        """)
        conn.commit()

# Session operations
def create_session(session_id: str, user_name: str, destination: str = "", custom_notes: str = "", emergency_contacts: List[Dict[str, str]] = None) -> Dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    contacts_json = json.dumps(emergency_contacts or [])
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO sessions (id, user_name, status, destination, custom_notes, emergency_contacts, created_at, last_active_at)
            VALUES (?, ?, 'active', ?, ?, ?, ?, ?)
        """, (session_id, user_name, destination, custom_notes, contacts_json, now, now))
        conn.commit()
    return get_session(session_id)

def get_session(session_id: str) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
        row = cursor.fetchone()
        if not row:
            return None
        data = dict(row)
        try:
            data['emergency_contacts'] = json.loads(data['emergency_contacts'] or '[]')
        except Exception:
            data['emergency_contacts'] = []
        return data

def update_session_status(session_id: str, status: str, battery_level: Optional[float] = None, battery_charging: Optional[bool] = None) -> Optional[Dict[str, Any]]:
    now = datetime.now(timezone.utc).isoformat()
    with get_db() as conn:
        cursor = conn.cursor()
        if battery_level is not None and battery_charging is not None:
            cursor.execute("""
                UPDATE sessions 
                SET status = ?, battery_level = ?, battery_charging = ?, last_active_at = ?
                WHERE id = ?
            """, (status, battery_level, 1 if battery_charging else 0, now, session_id))
        else:
            cursor.execute("""
                UPDATE sessions 
                SET status = ?, last_active_at = ?
                WHERE id = ?
            """, (status, now, session_id))
        conn.commit()
    return get_session(session_id)

def update_session_contacts(session_id: str, contacts: List[Dict[str, str]]) -> Optional[Dict[str, Any]]:
    now = datetime.now(timezone.utc).isoformat()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE sessions 
            SET emergency_contacts = ?, last_active_at = ?
            WHERE id = ?
        """, (json.dumps(contacts), now, session_id))
        conn.commit()
    return get_session(session_id)

# Location operations
def add_location(session_id: str, latitude: float, longitude: float, accuracy: float = 0, speed: float = 0, heading: float = 0, altitude: float = 0) -> Dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO locations (session_id, latitude, longitude, accuracy, speed, heading, altitude, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (session_id, latitude, longitude, accuracy, speed, heading, altitude, now))
        loc_id = cursor.lastrowid
        cursor.execute("UPDATE sessions SET last_active_at = ? WHERE id = ?", (now, session_id))
        conn.commit()
    return {
        "id": loc_id,
        "session_id": session_id,
        "latitude": latitude,
        "longitude": longitude,
        "accuracy": accuracy,
        "speed": speed,
        "heading": heading,
        "altitude": altitude,
        "timestamp": now
    }

def get_latest_location(session_id: str) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM locations 
            WHERE session_id = ? 
            ORDER BY id DESC LIMIT 1
        """, (session_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

def get_location_history(session_id: str, limit: int = 200) -> List[Dict[str, Any]]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM locations 
            WHERE session_id = ? 
            ORDER BY id ASC LIMIT ?
        """, (session_id, limit))
        rows = cursor.fetchall()
        return [dict(r) for r in rows]

# Snapshot operations
def add_snapshot(session_id: str, filename: str, latitude: Optional[float] = None, longitude: Optional[float] = None, is_sos: bool = False, note: str = "") -> Dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO snapshots (session_id, filename, latitude, longitude, is_sos, note, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (session_id, filename, latitude, longitude, 1 if is_sos else 0, note, now))
        snap_id = cursor.lastrowid
        conn.commit()
    return {
        "id": snap_id,
        "session_id": session_id,
        "filename": filename,
        "latitude": latitude,
        "longitude": longitude,
        "is_sos": is_sos,
        "note": note,
        "timestamp": now
    }

def get_snapshots(session_id: str) -> List[Dict[str, Any]]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM snapshots 
            WHERE session_id = ? 
            ORDER BY id DESC
        """, (session_id,))
        rows = cursor.fetchall()
        return [dict(r) for r in rows]

# SOS operations
def log_sos(session_id: str, latitude: Optional[float] = None, longitude: Optional[float] = None, notes: str = "") -> Dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO sos_logs (session_id, latitude, longitude, status, triggered_at, notes)
            VALUES (?, ?, ?, 'triggered', ?, ?)
        """, (session_id, latitude, longitude, now, notes))
        sos_id = cursor.lastrowid
        cursor.execute("UPDATE sessions SET status = 'sos', last_active_at = ? WHERE id = ?", (now, session_id))
        conn.commit()
    return {
        "id": sos_id,
        "session_id": session_id,
        "latitude": latitude,
        "longitude": longitude,
        "status": "triggered",
        "triggered_at": now,
        "notes": notes
    }

def resolve_sos(session_id: str, notes: str = "Resolved by user") -> bool:
    now = datetime.now(timezone.utc).isoformat()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE sos_logs 
            SET status = 'resolved', resolved_at = ?, notes = ?
            WHERE session_id = ? AND status = 'triggered'
        """, (now, notes, session_id))
        cursor.execute("UPDATE sessions SET status = 'active', last_active_at = ? WHERE id = ?", (now, session_id))
        conn.commit()
    return True
