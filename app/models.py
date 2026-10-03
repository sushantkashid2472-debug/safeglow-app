"""
Pydantic data models for SafeGlow API requests and responses.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class EmergencyContact(BaseModel):
    name: str = Field(..., examples=["Mom"])
    phone: str = Field(..., examples=["+1234567890"])
    relation: Optional[str] = Field("Contact", examples=["Family"])

class CreateSessionRequest(BaseModel):
    user_name: str = Field(..., min_length=1, max_length=100, examples=["Maya"])
    destination: Optional[str] = Field("", max_length=200, examples=["Home from Metro"])
    custom_notes: Optional[str] = Field("", max_length=500, examples=["Wearing pink jacket"])
    emergency_contacts: Optional[List[EmergencyContact]] = Field(default_factory=list)

class LocationUpdate(BaseModel):
    latitude: float
    longitude: float
    accuracy: Optional[float] = 0
    speed: Optional[float] = 0
    heading: Optional[float] = 0
    altitude: Optional[float] = 0
    battery_level: Optional[float] = None
    battery_charging: Optional[bool] = None

class SosTriggerRequest(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    notes: Optional[str] = "SOS button triggered from phone"

class SosResolveRequest(BaseModel):
    notes: Optional[str] = "False alarm / Safe now"

class StatusUpdateRequest(BaseModel):
    status: str = Field(..., examples=["safe"])  # 'active', 'safe', 'ended'
    battery_level: Optional[float] = None
    battery_charging: Optional[bool] = None

class SnapshotUploadResponse(BaseModel):
    success: bool
    snapshot_id: int
    filename: str
    url: str
    timestamp: str

class SessionDetailResponse(BaseModel):
    id: str
    user_name: str
    status: str
    battery_level: float
    battery_charging: bool
    destination: str
    custom_notes: str
    emergency_contacts: List[Dict[str, Any]]
    created_at: str
    last_active_at: str
    latest_location: Optional[Dict[str, Any]] = None
    location_count: int = 0
    snapshot_count: int = 0
