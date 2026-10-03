"""
SafeGlow - Personal Safety & Live Tracking Web Application
FastAPI Backend with WebSockets, Real-time GPS Streaming, SOS Alerts, and Camera Snapshot Processing.
"""

import os
import uuid
import json
import base64
from datetime import datetime, timezone
from typing import Dict, List, Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from app.database import (
    init_db, create_session, get_session, update_session_status,
    update_session_contacts, add_location, get_latest_location,
    get_location_history, add_snapshot, get_snapshots, log_sos, resolve_sos
)
from app.models import (
    CreateSessionRequest, LocationUpdate, SosTriggerRequest,
    SosResolveRequest, StatusUpdateRequest
)

# App directory configuration
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")
UPLOADS_DIR = os.path.join(STATIC_DIR, "uploads")

os.makedirs(STATIC_DIR, exist_ok=True)
os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(TEMPLATES_DIR, exist_ok=True)

# Initialize database
init_db()

app = FastAPI(
    title="SafeGlow",
    description="Live location tracking and emergency companion app with anxiety relief & SOS alerts.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# WebSocket Connection Manager for live tracking
class ConnectionManager:
    def __init__(self):
        # Maps session_id -> set of active WebSockets (user + any number of guardians)
        self.active_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, session_id: str, websocket: WebSocket):
        await websocket.accept()
        if session_id not in self.active_connections:
            self.active_connections[session_id] = set()
        self.active_connections[session_id].add(websocket)

    def disconnect(self, session_id: str, websocket: WebSocket):
        if session_id in self.active_connections:
            self.active_connections[session_id].discard(websocket)
            if not self.active_connections[session_id]:
                del self.active_connections[session_id]

    async def broadcast(self, session_id: str, message: dict):
        if session_id in self.active_connections:
            dead_sockets = set()
            for connection in self.active_connections[session_id]:
                try:
                    await connection.send_json(message)
                except Exception:
                    dead_sockets.add(connection)
            for dead in dead_sockets:
                self.active_connections[session_id].discard(dead)

manager = ConnectionManager()

# --- Page Routes ---

@app.get("/", response_class=HTMLResponse)
async def serve_walker_page():
    index_file = os.path.join(TEMPLATES_DIR, "index.html")
    if not os.path.exists(index_file):
        raise HTTPException(status_code=404, detail="Index template not found")
    with open(index_file, "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

@app.get("/track/{session_id}", response_class=HTMLResponse)
async def serve_guardian_page(session_id: str):
    session = get_session(session_id)
    if not session:
        return HTMLResponse(
            content=f"<html><head><title>SafeGlow - Not Found</title></head><body style='font-family:sans-serif;text-align:center;padding:50px;background:#FFF0F3;'><h2>Session not found or expired 🌸</h2><p>Please request a new safe walk link from your friend.</p><a href='/' style='color:#FF5D8F;text-decoration:none;font-weight:bold;'>Go to SafeGlow Home</a></body></html>",
            status_code=404
        )
    track_file = os.path.join(TEMPLATES_DIR, "track.html")
    if not os.path.exists(track_file):
        raise HTTPException(status_code=404, detail="Track template not found")
    with open(track_file, "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

# --- REST API Endpoints ---

@app.post("/api/sessions")
async def create_new_session(req: CreateSessionRequest):
    # Short friendly session ID
    session_id = f"glow-{uuid.uuid4().hex[:8]}"
    contacts_list = [c.model_dump() for c in req.emergency_contacts] if req.emergency_contacts else []
    session = create_session(
        session_id=session_id,
        user_name=req.user_name,
        destination=req.destination or "",
        custom_notes=req.custom_notes or "",
        emergency_contacts=contacts_list
    )
    return {
        "success": True,
        "session": session,
        "share_url": f"/track/{session_id}"
    }

@app.get("/api/sessions/{session_id}")
async def get_session_details(session_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    latest_loc = get_latest_location(session_id)
    history = get_location_history(session_id, limit=300)
    snapshots = get_snapshots(session_id)
    
    return {
        "session": session,
        "latest_location": latest_loc,
        "history": history,
        "snapshots": snapshots
    }

@app.post("/api/sessions/{session_id}/location")
async def post_location_update(session_id: str, loc: LocationUpdate):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    saved_loc = add_location(
        session_id=session_id,
        latitude=loc.latitude,
        longitude=loc.longitude,
        accuracy=loc.accuracy or 0,
        speed=loc.speed or 0,
        heading=loc.heading or 0,
        altitude=loc.altitude or 0
    )
    
    # Update battery if provided
    if loc.battery_level is not None:
        update_session_status(
            session_id=session_id,
            status=session["status"],
            battery_level=loc.battery_level,
            battery_charging=loc.battery_charging
        )

    # Broadcast to all connected guardians
    await manager.broadcast(session_id, {
        "type": "location_update",
        "location": saved_loc,
        "battery": {
            "level": loc.battery_level,
            "charging": loc.battery_charging
        }
    })
    
    return {"success": True, "location": saved_loc}

@app.post("/api/sessions/{session_id}/sos")
async def trigger_sos(session_id: str, req: SosTriggerRequest):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    sos_entry = log_sos(
        session_id=session_id,
        latitude=req.latitude,
        longitude=req.longitude,
        notes=req.notes or "Urgent SOS triggered"
    )
    
    # Broadcast urgent emergency notification to all guardians
    await manager.broadcast(session_id, {
        "type": "sos_alert",
        "status": "sos",
        "sos": sos_entry,
        "message": f"🚨 EMERGENCY: {session['user_name']} has pressed the SOS button!"
    })
    
    return {"success": True, "sos": sos_entry}

@app.post("/api/sessions/{session_id}/resolve-sos")
async def resolve_sos_endpoint(session_id: str, req: SosResolveRequest):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    resolve_sos(session_id, notes=req.notes or "Marked safe by user")
    
    await manager.broadcast(session_id, {
        "type": "sos_resolved",
        "status": "active",
        "message": f"🌸 SOS alert cleared: {session['user_name']} marked themselves safe."
    })
    
    return {"success": True, "message": "SOS resolved"}

@app.post("/api/sessions/{session_id}/status")
async def set_session_status(session_id: str, req: StatusUpdateRequest):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    updated = update_session_status(
        session_id=session_id,
        status=req.status,
        battery_level=req.battery_level,
        battery_charging=req.battery_charging
    )
    
    await manager.broadcast(session_id, {
        "type": "status_change",
        "status": req.status,
        "session": updated
    })
    
    return {"success": True, "session": updated}

@app.post("/api/sessions/{session_id}/snapshot")
async def upload_camera_snapshot(
    session_id: str,
    file: UploadFile = File(None),
    image_base64: str = Form(None),
    latitude: float = Form(None),
    longitude: float = Form(None),
    is_sos: bool = Form(False),
    note: str = Form("")
):
    """
    Saves a photo captured from the back camera (either as multipart file or base64 data URL)
    for safety context so the guardian can see the surroundings (landmarks, shops, vehicles).
    """
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    filename = f"snap_{session_id}_{int(datetime.now(timezone.utc).timestamp())}_{uuid.uuid4().hex[:4]}.jpg"
    filepath = os.path.join(UPLOADS_DIR, filename)
    
    if file and file.filename:
        with open(filepath, "wb") as buffer:
            buffer.write(await file.read())
    elif image_base64:
        # Strip data URL prefix if present: data:image/jpeg;base64,...
        if "," in image_base64:
            image_base64 = image_base64.split(",", 1)[1]
        img_bytes = base64.b64decode(image_base64)
        with open(filepath, "wb") as buffer:
            buffer.write(img_bytes)
    else:
        raise HTTPException(status_code=400, detail="No image provided")
    
    snap_record = add_snapshot(
        session_id=session_id,
        filename=filename,
        latitude=latitude,
        longitude=longitude,
        is_sos=is_sos,
        note=note
    )
    snap_record["url"] = f"/static/uploads/{filename}"
    
    # Broadcast snapshot to guardian viewers
    await manager.broadcast(session_id, {
        "type": "snapshot_uploaded",
        "snapshot": snap_record,
        "message": f"📸 New safety photo from {session['user_name']}"
    })
    
    return {"success": True, "snapshot": snap_record}

@app.get("/api/sessions/{session_id}/snapshots")
async def list_snapshots(session_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    snaps = get_snapshots(session_id)
    for s in snaps:
        s["url"] = f"/static/uploads/{s['filename']}"
    return {"snapshots": snaps}

# --- WebSocket Endpoint ---

@app.websocket("/ws/{session_id}")
async def websocket_tracking_endpoint(websocket: WebSocket, session_id: str):
    await manager.connect(session_id, websocket)
    
    # Send initial state immediately upon connection
    session = get_session(session_id)
    latest_loc = get_latest_location(session_id)
    history = get_location_history(session_id, limit=100)
    snaps = get_snapshots(session_id)
    for s in snaps:
        s["url"] = f"/static/uploads/{s['filename']}"
        
    await websocket.send_json({
        "type": "initial_state",
        "session": session,
        "latest_location": latest_loc,
        "history": history,
        "snapshots": snaps
    })

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")
            
            if msg_type == "ping":
                await websocket.send_json({"type": "pong", "time": datetime.now(timezone.utc).isoformat()})
                
            elif msg_type == "location_update":
                lat = data.get("latitude")
                lon = data.get("longitude")
                if lat is not None and lon is not None:
                    saved_loc = add_location(
                        session_id=session_id,
                        latitude=lat,
                        longitude=lon,
                        accuracy=data.get("accuracy", 0),
                        speed=data.get("speed", 0),
                        heading=data.get("heading", 0),
                        altitude=data.get("altitude", 0)
                    )
                    bat_lvl = data.get("battery_level")
                    bat_chg = data.get("battery_charging")
                    if bat_lvl is not None and session:
                        update_session_status(session_id, session["status"], bat_lvl, bat_chg)

                    await manager.broadcast(session_id, {
                        "type": "location_update",
                        "location": saved_loc,
                        "battery": {"level": bat_lvl, "charging": bat_chg}
                    })

            elif msg_type == "sos_trigger":
                sos_entry = log_sos(
                    session_id=session_id,
                    latitude=data.get("latitude"),
                    longitude=data.get("longitude"),
                    notes=data.get("notes", "Urgent SOS button pressed")
                )
                await manager.broadcast(session_id, {
                    "type": "sos_alert",
                    "status": "sos",
                    "sos": sos_entry,
                    "message": f"🚨 EMERGENCY: SOS button pressed!"
                })

            elif msg_type == "sos_resolve":
                resolve_sos(session_id, notes=data.get("notes", "Resolved"))
                await manager.broadcast(session_id, {
                    "type": "sos_resolved",
                    "status": "active",
                    "message": "🌸 SOS alert resolved."
                })

    except WebSocketDisconnect:
        manager.disconnect(session_id, websocket)
    except Exception:
        manager.disconnect(session_id, websocket)

@app.get("/health")
async def health_check():
    return {"status": "ok", "app": "SafeGlow", "timestamp": datetime.now(timezone.utc).isoformat()}
