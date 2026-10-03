"""
Comprehensive automated tests for SafeGlow FastAPI application.
"""

import pytest
import os
import base64
from fastapi.testclient import TestClient

# Use temporary test database
os.environ["SAFEGLOW_DB_PATH"] = os.path.join(os.path.dirname(__file__), "test_safeglow.db")

from app.main import app
from app.database import init_db

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_database():
    init_db()
    yield
    # Cleanup test db
    db_path = os.environ.get("SAFEGLOW_DB_PATH")
    if db_path and os.path.exists(db_path):
        try:
            os.remove(db_path)
        except Exception:
            pass

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["app"] == "SafeGlow"

def test_serve_html_pages():
    # User page
    res_index = client.get("/")
    assert res_index.status_code == 200
    assert "SafeGlow" in res_index.text

    # Create session first for guardian page test
    res_create = client.post("/api/sessions", json={
        "user_name": "Maya",
        "destination": "Home",
        "emergency_contacts": [{"name": "Mom", "phone": "1234567890", "relation": "Family"}]
    })
    assert res_create.status_code == 200
    session_id = res_create.json()["session"]["id"]

    # Guardian page
    res_track = client.get(f"/track/{session_id}")
    assert res_track.status_code == 200
    assert "SafeGlow Guardian" in res_track.text

def test_session_lifecycle_and_location():
    # 1. Create Session
    create_res = client.post("/api/sessions", json={
        "user_name": "Ananya",
        "destination": "Apartment block B",
        "custom_notes": "Carrying blue umbrella",
        "emergency_contacts": [
            {"name": "Sister", "phone": "+919876543210", "relation": "Family"},
            {"name": "Police", "phone": "112", "relation": "Emergency"}
        ]
    })
    assert create_res.status_code == 200
    res_data = create_res.json()
    assert res_data["success"] is True
    session_id = res_data["session"]["id"]
    assert session_id.startswith("glow-")

    # 2. Get Session Details
    get_res = client.get(f"/api/sessions/{session_id}")
    assert get_res.status_code == 200
    session_data = get_res.json()
    assert session_data["session"]["user_name"] == "Ananya"
    assert session_data["session"]["status"] == "active"
    assert len(session_data["session"]["emergency_contacts"]) == 2

    # 3. Post Location Updates (Breadcrumbs)
    loc1 = client.post(f"/api/sessions/{session_id}/location", json={
        "latitude": 28.6139,
        "longitude": 77.2090,
        "accuracy": 8.5,
        "speed": 1.2,
        "heading": 90,
        "battery_level": 85.0,
        "battery_charging": False
    })
    assert loc1.status_code == 200
    assert loc1.json()["success"] is True

    loc2 = client.post(f"/api/sessions/{session_id}/location", json={
        "latitude": 28.6145,
        "longitude": 77.2095,
        "accuracy": 5.0,
        "speed": 1.4,
        "heading": 95,
        "battery_level": 84.0,
        "battery_charging": False
    })
    assert loc2.status_code == 200

    # 4. Verify History in Session
    history_res = client.get(f"/api/sessions/{session_id}")
    history_data = history_res.json()
    assert len(history_data["history"]) == 2
    assert history_data["latest_location"]["latitude"] == 28.6145
    assert history_data["session"]["battery_level"] == 84.0

def test_sos_trigger_and_resolve():
    # Create test session
    create_res = client.post("/api/sessions", json={"user_name": "Riya"})
    session_id = create_res.json()["session"]["id"]

    # Trigger SOS
    sos_res = client.post(f"/api/sessions/{session_id}/sos", json={
        "latitude": 19.0760,
        "longitude": 72.8777,
        "notes": "Feeling followed near corner store"
    })
    assert sos_res.status_code == 200
    assert sos_res.json()["success"] is True

    # Verify session status is now 'sos'
    get_res = client.get(f"/api/sessions/{session_id}")
    assert get_res.json()["session"]["status"] == "sos"

    # Resolve SOS
    resolve_res = client.post(f"/api/sessions/{session_id}/resolve-sos", json={
        "notes": "Reached friend's car safely"
    })
    assert resolve_res.status_code == 200

    # Verify session is back to 'active'
    get_res2 = client.get(f"/api/sessions/{session_id}")
    assert get_res2.json()["session"]["status"] == "active"

def test_camera_snapshot_upload():
    create_res = client.post("/api/sessions", json={"user_name": "Pooja"})
    session_id = create_res.json()["session"]["id"]

    # 1x1 transparent dummy JPEG base64
    dummy_base64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="

    upload_res = client.post(f"/api/sessions/{session_id}/snapshot", data={
        "image_base64": dummy_base64,
        "latitude": 12.9716,
        "longitude": 77.5946,
        "is_sos": "false",
        "note": "Street corner landmark"
    })
    assert upload_res.status_code == 200
    upload_data = upload_res.json()
    assert upload_data["success"] is True
    assert "snap_" in upload_data["snapshot"]["filename"]
    assert upload_data["snapshot"]["url"].startswith("/static/uploads/")

    # Check snapshots list
    snaps_res = client.get(f"/api/sessions/{session_id}/snapshots")
    assert snaps_res.status_code == 200
    snaps = snaps_res.json()["snapshots"]
    assert len(snaps) == 1
    assert snaps[0]["note"] == "Street corner landmark"
