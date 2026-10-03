/**
 * SafeGlow - Guardian Live Tracking Interface
 * Displays real-time GPS location on Leaflet map, polyline route trail,
 * instant SOS audio & visual siren alert, and back-camera surroundings photos.
 */

let map = null;
let userMarker = null;
let accuracyCircle = null;
let routePolyline = null;
let pathCoordinates = [];
let sessionId = null;
let ws = null;
let autoCenter = true;
let isSosAlarmActive = false;

document.addEventListener("DOMContentLoaded", () => {
    // Extract session ID from URL path: /track/{session_id}
    const pathParts = window.location.pathname.split('/');
    sessionId = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];

    initTheme();
    initMap();
    loadInitialData();
    connectWebSocket();
});

function initTheme() {
    const savedTheme = localStorage.getItem("safeglow_theme") || "light";
    document.documentElement.setAttribute("data-theme", savedTheme);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("safeglow_theme", next);
}

function initMap() {
    // Initialize Leaflet map with OpenStreetMap tiles (free, reliable, no API key needed)
    map = L.map('guardian-map', {
        zoomControl: true,
        attributionControl: false
    }).setView([20.5937, 78.9629], 5); // Default view (centered broadly until GPS arrives)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
    }).addTo(map);

    routePolyline = L.polyline([], {
        color: '#FF5D8F',
        weight: 4,
        opacity: 0.8,
        dashArray: '8, 8',
        lineCap: 'round'
    }).addTo(map);
}

// Cute glowing custom pin for the user
function createCustomPin() {
    return L.divIcon({
        className: 'custom-guardian-pin',
        html: `
            <div style="position:relative; width:36px; height:36px;">
                <div style="position:absolute; inset:-8px; background:rgba(255,93,143,0.3); border-radius:50%; animation:pulse-sos 1.5s infinite alternate;"></div>
                <div style="position:absolute; inset:0; background:linear-gradient(135deg, #FF758C, #FF5D8F); border:3px solid white; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-size:16px; box-shadow:0 4px 12px rgba(0,0,0,0.3);">
                    🌸
                </div>
            </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
    });
}

async function loadInitialData() {
    try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (!res.ok) throw new Error("Session not found");
        const data = await res.json();

        updateSessionUI(data.session);

        // Populate history path
        if (data.history && data.history.length > 0) {
            pathCoordinates = data.history.map(pt => [pt.latitude, pt.longitude]);
            routePolyline.setLatLngs(pathCoordinates);
        }

        // Set latest location
        if (data.latest_location) {
            updateMapPosition(data.latest_location);
        }

        // Populate snapshots
        if (data.snapshots && data.snapshots.length > 0) {
            renderSnapshots(data.snapshots);
        }

        // Check if SOS active
        if (data.session && data.session.status === 'sos') {
            triggerGuardianSOS();
        }
    } catch (err) {
        console.error("Failed to load initial session details", err);
    }
}

function updateSessionUI(session) {
    if (!session) return;
    document.getElementById("user-name-display").innerText = session.user_name || "Companion";
    
    if (session.destination) {
        const destEl = document.getElementById("destination-display");
        if (destEl) destEl.innerText = `Heading to: ${session.destination}`;
    }

    if (session.emergency_contacts && session.emergency_contacts.length > 0) {
        renderGuardianContacts(session.emergency_contacts);
    }

    updateBatteryDisplay(session.battery_level, session.battery_charging);
    updateStatusBadge(session.status);
}

function updateStatusBadge(status) {
    const badge = document.getElementById("guardian-status-badge");
    if (!badge) return;

    if (status === 'sos') {
        badge.className = "status-pill status-sos";
        badge.innerHTML = `<span class="status-dot"></span> 🚨 EMERGENCY SOS`;
        triggerGuardianSOS();
    } else if (status === 'safe') {
        badge.className = "status-pill status-safe";
        badge.innerHTML = `<span class="status-dot"></span> 🌸 Arrived Safely`;
        resolveGuardianSOS();
    } else {
        badge.className = "status-pill status-active";
        badge.innerHTML = `<span class="status-dot"></span> ✨ Walking Safely`;
        resolveGuardianSOS();
    }
}

function updateBatteryDisplay(level, charging) {
    const batEl = document.getElementById("guardian-battery-badge");
    if (batEl && level !== null && level !== undefined) {
        batEl.innerHTML = `<i class="fa-solid fa-battery-half"></i> ${Math.round(level)}% ${charging ? '⚡' : ''}`;
    }
}

function updateMapPosition(loc) {
    const latLng = [loc.latitude, loc.longitude];

    if (!userMarker) {
        userMarker = L.marker(latLng, { icon: createCustomPin() }).addTo(map);
        userMarker.bindPopup(`<b>🌸 Live Companion</b><br>Updated just now`);
    } else {
        userMarker.setLatLng(latLng);
    }

    if (loc.accuracy) {
        if (!accuracyCircle) {
            accuracyCircle = L.circle(latLng, {
                radius: loc.accuracy,
                color: '#FF5D8F',
                fillColor: '#FFE5EC',
                fillOpacity: 0.25,
                weight: 1
            }).addTo(map);
        } else {
            accuracyCircle.setLatLng(latLng);
            accuracyCircle.setRadius(loc.accuracy);
        }
    }

    // Append to path trail
    pathCoordinates.push(latLng);
    routePolyline.setLatLngs(pathCoordinates);

    if (autoCenter) {
        map.setView(latLng, Math.max(map.getZoom(), 16), { animate: true });
    }

    // Update coordinate badge
    const coordEl = document.getElementById("coords-display");
    if (coordEl) {
        coordEl.innerText = `${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)} (±${Math.round(loc.accuracy || 0)}m)`;
    }

    const lastSeenEl = document.getElementById("last-seen-display");
    if (lastSeenEl) {
        lastSeenEl.innerText = `Updated: ${new Date().toLocaleTimeString()}`;
    }
}

function toggleAutoCenter() {
    autoCenter = !autoCenter;
    const btn = document.getElementById("center-map-btn");
    if (btn) {
        btn.innerHTML = autoCenter ? `<i class="fa-solid fa-crosshairs"></i> Auto-Follow: ON` : `<i class="fa-solid fa-crosshairs"></i> Auto-Follow: OFF`;
    }
    if (autoCenter && userMarker) {
        map.setView(userMarker.getLatLng(), 16, { animate: true });
    }
}

// --- WebSocket Connection ---
function connectWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/${sessionId}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log("Connected to guardian tracking WebSocket");
        const statusEl = document.getElementById("ws-guardian-status");
        if (statusEl) statusEl.innerHTML = `<span class="status-dot"></span> Live GPS Stream`;
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);

            if (data.type === "location_update") {
                if (data.location) {
                    updateMapPosition(data.location);
                }
                if (data.battery) {
                    updateBatteryDisplay(data.battery.level, data.battery.charging);
                }
            } else if (data.type === "sos_alert") {
                triggerGuardianSOS(data.message);
            } else if (data.type === "sos_resolved") {
                resolveGuardianSOS();
                updateStatusBadge('safe');
            } else if (data.type === "snapshot_uploaded") {
                handleNewSnapshot(data.snapshot);
            } else if (data.type === "status_change") {
                updateStatusBadge(data.status);
            }
        } catch (e) {
            console.error("WS Parse error", e);
        }
    };

    ws.onclose = () => {
        console.warn("WebSocket closed. Retrying in 3 seconds...");
        setTimeout(connectWebSocket, 3000);
    };
}

// --- SOS Handling on Guardian End ---
function triggerGuardianSOS(message) {
    isSosAlarmActive = true;
    const sosBanner = document.getElementById("guardian-sos-banner");
    if (sosBanner) sosBanner.style.display = "flex";

    // Play siren so guardian is immediately alerted
    window.soundEffects.startSiren();

    // Vibrate device if supported
    if (navigator.vibrate) {
        navigator.vibrate([500, 250, 500, 250, 1000]);
    }

    updateStatusBadge('sos');
}

function resolveGuardianSOS() {
    isSosAlarmActive = false;
    window.soundEffects.stopSiren();
    const sosBanner = document.getElementById("guardian-sos-banner");
    if (sosBanner) sosBanner.style.display = "none";
}

function muteGuardianSiren() {
    window.soundEffects.stopSiren();
}

// --- Camera Surroundings Feed ---
function renderSnapshots(snapshots) {
    const container = document.getElementById("snapshots-gallery");
    if (!container) return;

    if (!snapshots || snapshots.length === 0) {
        container.innerHTML = `<p style="font-size:0.82rem; color:var(--text-muted); padding:10px 0;">No camera photos sent yet. Photos taken by the walker will show up here automatically.</p>`;
        return;
    }

    container.innerHTML = snapshots.map(s => {
        const time = new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `
            <div style="position:relative; flex-shrink:0;">
                <img src="${s.url}" alt="Surroundings" class="snapshot-thumb" onclick="openPhotoLightbox('${s.url}', '${time}', '${s.note || ''}')" />
                <span style="position:absolute; bottom:6px; left:6px; background:rgba(0,0,0,0.65); color:white; font-size:10px; padding:2px 6px; border-radius:4px;">
                    ${s.is_sos ? '🚨 ' : ''}${time}
                </span>
            </div>
        `;
    }).join("");
}

function handleNewSnapshot(snapshot) {
    renderSnapshots([snapshot, ...(window._cachedSnapshots || [])]);
    window._cachedSnapshots = [snapshot, ...(window._cachedSnapshots || [])];
    
    // Quick notification chime
    window.soundEffects.playChime();
    
    // Auto-open lightbox if it was an SOS snapshot
    if (snapshot.is_sos) {
        openPhotoLightbox(snapshot.url, "Just now", "🚨 Urgent SOS Surroundings Snapshot!");
    }
}

function openPhotoLightbox(url, time, note) {
    let modal = document.getElementById("photo-lightbox");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "photo-lightbox";
        modal.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.9);
            z-index: 3000; display: flex; flex-direction: column;
            align-items: center; justify-content: center; padding: 20px;
        `;
        document.body.appendChild(modal);
    }
    modal.innerHTML = `
        <div style="position:relative; max-width:90%; max-height:80%;">
            <img src="${url}" style="width:100%; height:auto; max-height:75vh; border-radius:12px; object-fit:contain; box-shadow:0 10px 30px rgba(0,0,0,0.8);" />
            <div style="color:white; margin-top:12px; text-align:center;">
                <p style="font-weight:700; font-size:1rem;">Surroundings Photo (${time})</p>
                <p style="font-size:0.85rem; color:#A0A3BD;">${note}</p>
            </div>
        </div>
        <button onclick="document.getElementById('photo-lightbox').style.display='none'" style="margin-top:20px; background:white; border:none; padding:10px 24px; border-radius:50px; font-weight:700; cursor:pointer;">
            Close ✕
        </button>
    `;
    modal.style.display = "flex";
}

function renderGuardianContacts(contacts) {
    const list = document.getElementById("guardian-contacts-list");
    if (!list) return;

    list.innerHTML = contacts.map(c => `
        <a href="tel:${c.phone}" class="emergency-dial-btn" style="padding:10px;">
            <div class="dial-icon" style="width:32px; height:32px; font-size:0.9rem;"><i class="fa-solid fa-phone"></i></div>
            <div class="dial-info">
                <span class="dial-title">${escapeHtml(c.name)}</span>
                <span class="dial-number">${escapeHtml(c.phone)}</span>
            </div>
        </a>
    `).join("");
}

function copyCoordinates() {
    const coordEl = document.getElementById("coords-display");
    if (coordEl && coordEl.innerText) {
        const text = `SafeGlow Emergency Alert! Person's current location: ${coordEl.innerText}. Live view: ${window.location.href}`;
        navigator.clipboard.writeText(text);
        alert("Coordinates and live link copied! You can paste this to emergency dispatchers or family.");
    }
}

function escapeHtml(text) {
    if (!text) return "";
    return text.replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[m]);
}
