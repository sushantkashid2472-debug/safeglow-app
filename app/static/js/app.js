/**
 * SafeGlow - Walker Companion Script
 * Handles real-time geolocation tracking, back-camera safety snapshots,
 * instant SOS broadcast, fake call simulator, and anxiety-relief breathing.
 */

let currentSession = null;
let watchPositionId = null;
let ws = null;
let currentCoords = null;
let cameraStream = null;
let isSosActive = false;
let breathingInterval = null;
let fakeCallTimer = null;
let fakeCallDurationInterval = null;

// Default Emergency Contacts
const defaultContacts = [
    { name: "Emergency Dispatch", phone: "112", relation: "National SOS" },
    { name: "Women Helpline", phone: "1091", relation: "Helpline" },
    { name: "Police Direct", phone: "100", relation: "Police" },
    { name: "Ambulance", phone: "108", relation: "Medical" }
];

document.addEventListener("DOMContentLoaded", () => {
    loadLocalSettings();
    renderEmergencyContacts();
    setupBatteryMonitoring();
    checkExistingSession();
});

// --- Theme toggle ---
function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("safeglow_theme", next);
}

function loadLocalSettings() {
    const savedTheme = localStorage.getItem("safeglow_theme") || "light";
    document.documentElement.setAttribute("data-theme", savedTheme);

    const savedName = localStorage.getItem("safeglow_user_name");
    if (savedName && document.getElementById("user-name-input")) {
        document.getElementById("user-name-input").value = savedName;
    }
}

// --- Battery Status ---
let batteryInfo = { level: 100, charging: false };

async function setupBatteryMonitoring() {
    if ('getBattery' in navigator) {
        try {
            const battery = await navigator.getBattery();
            const updateBat = () => {
                batteryInfo.level = Math.round(battery.level * 100);
                batteryInfo.charging = battery.charging;
                updateBatteryUI();
            };
            battery.addEventListener('levelchange', updateBat);
            battery.addEventListener('chargingchange', updateBat);
            updateBat();
        } catch (e) {
            console.log("Battery API not permitted or available");
        }
    }
}

function updateBatteryUI() {
    const el = document.getElementById("battery-indicator");
    if (el) {
        el.innerHTML = `<i class="fa-solid fa-battery-half"></i> ${batteryInfo.level}% ${batteryInfo.charging ? '⚡' : ''}`;
    }
}

// --- Session Setup & Start Safe Walk ---
async function startSafeWalk() {
    const nameInput = document.getElementById("user-name-input");
    const destInput = document.getElementById("destination-input");
    const userName = (nameInput && nameInput.value.trim()) || "Someone Special";
    const destination = (destInput && destInput.value.trim()) || "";

    localStorage.setItem("safeglow_user_name", userName);

    const startBtn = document.getElementById("start-walk-btn");
    if (startBtn) {
        startBtn.disabled = true;
        startBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Initializing GPS...`;
    }

    try {
        // Request GPS coordinates first
        const initialPos = await getCurrentPositionPromise();
        currentCoords = {
            latitude: initialPos.coords.latitude,
            longitude: initialPos.coords.longitude,
            accuracy: initialPos.coords.accuracy,
            speed: initialPos.coords.speed || 0,
            heading: initialPos.coords.heading || 0
        };

        const contacts = getSavedContacts();

        // Create session via REST API
        const response = await fetch("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                user_name: userName,
                destination: destination,
                emergency_contacts: contacts
            })
        });

        const data = await response.json();
        if (data.success) {
            currentSession = data.session;
            sessionStorage.setItem("safeglow_session_id", currentSession.id);

            // Send initial location
            await fetch(`/api/sessions/${currentSession.id}/location`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...currentCoords,
                    battery_level: batteryInfo.level,
                    battery_charging: batteryInfo.charging
                })
            });

            // Connect WebSocket
            connectWebSocket(currentSession.id);

            // Start continuous GPS tracking
            startLocationWatcher();

            // Update UI to Active Mode
            showActiveWalkUI(currentSession);
            showToast("✨ Safe Walk started! Share link with your guardian.");
            window.soundEffects.playChime();
        } else {
            alert("Could not start session. Please try again.");
        }
    } catch (err) {
        console.error("Error starting walk:", err);
        alert("Please enable Location / GPS permission in your browser so your guardian can track your path.");
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.innerHTML = `<i class="fa-solid fa-shield-heart"></i> Start Safe Walk & Share Link`;
        }
    }
}

function getCurrentPositionPromise() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            return reject(new Error("Geolocation not supported"));
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        });
    });
}

function startLocationWatcher() {
    if (navigator.geolocation) {
        watchPositionId = navigator.geolocation.watchPosition(
            (pos) => {
                currentCoords = {
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    speed: pos.coords.speed || 0,
                    heading: pos.coords.heading || 0
                };
                sendLocationUpdate();
            },
            (err) => console.warn("Watch position error:", err),
            {
                enableHighAccuracy: true,
                maximumAge: 3000,
                timeout: 8000
            }
        );
    }
}

function sendLocationUpdate() {
    if (!currentSession || !currentCoords) return;

    const payload = {
        type: "location_update",
        ...currentCoords,
        battery_level: batteryInfo.level,
        battery_charging: batteryInfo.charging
    };

    // Send via WebSocket if open
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
    } else {
        // Fallback REST endpoint
        fetch(`/api/sessions/${currentSession.id}/location`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        }).catch(err => console.log("Location fallback failed:", err));
    }
}

function connectWebSocket(sessionId) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/${sessionId}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log("WebSocket connected to SafeGlow hub");
        const statusEl = document.getElementById("connection-status");
        if (statusEl) statusEl.innerHTML = `<span class="status-dot"></span> Live Connected`;
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === "sos_alert") {
                triggerSosUI();
            } else if (data.type === "sos_resolved") {
                resolveSosUI();
            }
        } catch (e) {
            console.error("WS Parse error", e);
        }
    };

    ws.onclose = () => {
        console.log("WS closed, attempting reconnect in 3s...");
        setTimeout(() => {
            if (currentSession) connectWebSocket(sessionId);
        }, 3000);
    };
}

async function checkExistingSession() {
    const existingId = sessionStorage.getItem("safeglow_session_id");
    if (existingId) {
        try {
            const res = await fetch(`/api/sessions/${existingId}`);
            if (res.ok) {
                const data = await res.json();
                if (data.session && data.session.status !== 'ended') {
                    currentSession = data.session;
                    connectWebSocket(currentSession.id);
                    startLocationWatcher();
                    showActiveWalkUI(currentSession);
                    if (data.session.status === 'sos') {
                        triggerSosUI();
                    }
                }
            }
        } catch (e) {
            console.log("No valid existing session");
        }
    }
}

function showActiveWalkUI(session) {
    document.getElementById("setup-section").style.display = "none";
    document.getElementById("active-walk-section").style.display = "block";

    const shareUrl = `${window.location.origin}/track/${session.id}`;
    const shareInput = document.getElementById("share-url-input");
    if (shareInput) shareInput.value = shareUrl;

    // Setup WhatsApp button
    const waBtn = document.getElementById("whatsapp-share-btn");
    if (waBtn) {
        const text = encodeURIComponent(`🌸 Hi! I'm walking right now. Please keep an eye on my live tracking here: ${shareUrl}\n(SOS alerts and camera snapshots will show up here too)`);
        waBtn.onclick = () => window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
    }

    // Coordinates preview
    updateLocationDisplay();
}

function updateLocationDisplay() {
    const locEl = document.getElementById("current-loc-badge");
    if (locEl && currentCoords) {
        locEl.innerText = `Lat: ${currentCoords.latitude.toFixed(4)}, Lon: ${currentCoords.longitude.toFixed(4)}`;
    }
}

function copyShareLink() {
    const input = document.getElementById("share-url-input");
    if (input) {
        input.select();
        navigator.clipboard.writeText(input.value);
        showToast("🌸 Tracking link copied to clipboard!");
    }
}

// --- SOS Logic ---
async function triggerSOS() {
    if (!currentSession) {
        alert("Please start a Safe Walk first so your link is active.");
        return;
    }

    isSosActive = true;
    window.soundEffects.startSiren();
    triggerSosUI();

    const payload = {
        latitude: currentCoords ? currentCoords.latitude : null,
        longitude: currentCoords ? currentCoords.longitude : null,
        notes: "Emergency SOS pressed directly by walker"
    };

    try {
        await fetch(`/api/sessions/${currentSession.id}/sos`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        console.error("SOS API trigger error", e);
    }

    // Auto-attempt quick safety snapshot from back camera during SOS
    captureSilentSnapshot();
}

function triggerSosUI() {
    isSosActive = true;
    const alertBox = document.getElementById("sos-active-banner");
    if (alertBox) alertBox.style.display = "flex";
    const sosBtn = document.getElementById("main-sos-btn");
    if (sosBtn) sosBtn.classList.add("sos-btn-active");
}

async function resolveSOS() {
    if (!currentSession) return;
    window.soundEffects.stopSiren();
    isSosActive = false;

    try {
        await fetch(`/api/sessions/${currentSession.id}/resolve-sos`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notes: "User marked herself safe" })
        });
    } catch (e) {
        console.error("Resolve SOS API error", e);
    }

    resolveSosUI();
    showToast("🌸 SOS cancelled. You are safe!");
    window.soundEffects.playChime();
}

function resolveSosUI() {
    const alertBox = document.getElementById("sos-active-banner");
    if (alertBox) alertBox.style.display = "none";
    const sosBtn = document.getElementById("main-sos-btn");
    if (sosBtn) sosBtn.classList.remove("sos-btn-active");
}

// --- Back Camera Snapshot Feature ---
async function openCameraModal() {
    const modal = document.getElementById("camera-modal");
    const video = document.getElementById("camera-video");
    modal.style.display = "flex";

    try {
        // Request Rear / Environment Camera
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: "environment" },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        });
        video.srcObject = cameraStream;
    } catch (err) {
        console.error("Camera access failed", err);
        alert("Camera permission denied or camera not found. Please allow camera permissions to take safety snapshots.");
        closeCameraModal();
    }
}

function closeCameraModal() {
    const modal = document.getElementById("camera-modal");
    modal.style.display = "none";
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
}

async function takeSnapshotAndUpload() {
    const video = document.getElementById("camera-video");
    if (!video || !cameraStream) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const base64Data = canvas.toDataURL("image/jpeg", 0.85);
    closeCameraModal();

    showToast("📸 Uploading safety photo...");
    await uploadSnapshotData(base64Data, false, "Manual safety snapshot");
}

async function captureSilentSnapshot() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } }
        });
        const video = document.createElement("video");
        video.srcObject = stream;
        await video.play();

        setTimeout(async () => {
            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const base64Data = canvas.toDataURL("image/jpeg", 0.85);

            stream.getTracks().forEach(t => t.stop());
            await uploadSnapshotData(base64Data, true, "Automatic SOS surroundings capture");
        }, 600);
    } catch (e) {
        console.log("Silent camera capture skipped (requires prior user interaction or permission)");
    }
}

async function uploadSnapshotData(base64Data, isSos = false, note = "") {
    if (!currentSession) return;

    const formData = new FormData();
    formData.append("image_base64", base64Data);
    if (currentCoords) {
        formData.append("latitude", currentCoords.latitude);
        formData.append("longitude", currentCoords.longitude);
    }
    formData.append("is_sos", isSos ? "true" : "false");
    formData.append("note", note);

    try {
        const res = await fetch(`/api/sessions/${currentSession.id}/snapshot`, {
            method: "POST",
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            showToast("✨ Photo sent! Your guardian can see your surroundings.");
            window.soundEffects.playChime();
        }
    } catch (err) {
        console.error("Upload snapshot error:", err);
        showToast("⚠️ Could not upload photo. Check network.");
    }
}

// --- End Safe Walk ---
async function endSafeWalk() {
    if (!confirm("Are you safe and ready to end your live walk session?")) return;

    if (currentSession) {
        try {
            await fetch(`/api/sessions/${currentSession.id}/status`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "safe" })
            });
        } catch (e) {
            console.log("End session error", e);
        }
    }

    if (watchPositionId !== null) {
        navigator.geolocation.clearWatch(watchPositionId);
        watchPositionId = null;
    }
    if (ws) {
        ws.close();
        ws = null;
    }
    window.soundEffects.stopSiren();
    sessionStorage.removeItem("safeglow_session_id");
    currentSession = null;

    document.getElementById("active-walk-section").style.display = "none";
    document.getElementById("setup-section").style.display = "block";
    showToast("🌸 Safe Walk ended! Glad you reached safely.");
    window.soundEffects.playChime();
}

// --- Fake Call Simulator (Deters Strangers / Eases Anxiety) ---
function scheduleFakeCall(delaySeconds = 0) {
    showToast(`📞 Fake incoming call in ${delaySeconds === 0 ? 'a moment' : delaySeconds + ' seconds'}...`);
    if (fakeCallTimer) clearTimeout(fakeCallTimer);

    fakeCallTimer = setTimeout(() => {
        startFakeCallRinging();
    }, delaySeconds * 1000);
}

function startFakeCallRinging() {
    const overlay = document.getElementById("fake-call-overlay");
    const incomingSection = document.getElementById("call-incoming-view");
    const activeSection = document.getElementById("call-active-view");

    incomingSection.style.display = "flex";
    activeSection.style.display = "none";
    overlay.style.display = "flex";

    window.soundEffects.startRingtone();
    if (navigator.vibrate) {
        navigator.vibrate([400, 400, 400, 400]);
    }
}

function acceptFakeCall() {
    window.soundEffects.stopRingtone();
    const incomingSection = document.getElementById("call-incoming-view");
    const activeSection = document.getElementById("call-active-view");

    incomingSection.style.display = "none";
    activeSection.style.display = "flex";

    let seconds = 0;
    const timerEl = document.getElementById("call-duration-timer");
    timerEl.innerText = "00:00";

    if (fakeCallDurationInterval) clearInterval(fakeCallDurationInterval);
    fakeCallDurationInterval = setInterval(() => {
        seconds++;
        const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
        const secs = String(seconds % 60).padStart(2, '0');
        timerEl.innerText = `${mins}:${secs}`;
    }, 1000);
}

function endFakeCall() {
    window.soundEffects.stopRingtone();
    if (fakeCallDurationInterval) {
        clearInterval(fakeCallDurationInterval);
        fakeCallDurationInterval = null;
    }
    document.getElementById("fake-call-overlay").style.display = "none";
}

// --- Calming 4-7-8 Breathing Guide for Anxiety ---
function openBreathingModal() {
    const modal = document.getElementById("breathing-modal");
    modal.style.display = "flex";
    runBreathingCycle();
}

function closeBreathingModal() {
    const modal = document.getElementById("breathing-modal");
    modal.style.display = "none";
    if (breathingInterval) {
        clearInterval(breathingInterval);
        breathingInterval = null;
    }
}

function runBreathingCycle() {
    const circle = document.getElementById("breathing-anim-circle");
    const text = document.getElementById("breathing-text");

    const cycle = () => {
        // Inhale (4s)
        text.innerText = "Breathe In Slowly... 🌿 (4s)";
        circle.className = "breathing-circle inhale";

        setTimeout(() => {
            // Hold (7s)
            text.innerText = "Hold Gently... ✨ (7s)";
            circle.className = "breathing-circle hold";

            setTimeout(() => {
                // Exhale (8s)
                text.innerText = "Exhale Peacefully... 🌸 (8s)";
                circle.className = "breathing-circle exhale";
            }, 7000);
        }, 4000);
    };

    cycle();
    breathingInterval = setInterval(cycle, 19000);
}

// --- Emergency Contacts Management ---
function getSavedContacts() {
    const saved = localStorage.getItem("safeglow_contacts");
    if (saved) {
        try { return JSON.parse(saved); } catch (e) { }
    }
    return defaultContacts;
}

function saveContacts(contacts) {
    localStorage.setItem("safeglow_contacts", JSON.stringify(contacts));
    renderEmergencyContacts();
}

function renderEmergencyContacts() {
    const container = document.getElementById("emergency-contacts-list");
    if (!container) return;

    const contacts = getSavedContacts();
    container.innerHTML = contacts.map(c => `
        <a href="tel:${c.phone}" class="emergency-dial-btn" onclick="logDialAttempt('${c.name}', '${c.phone}')">
            <div class="dial-icon"><i class="fa-solid fa-phone"></i></div>
            <div class="dial-info">
                <span class="dial-title">${escapeHtml(c.name)}</span>
                <span class="dial-number">${escapeHtml(c.phone)}</span>
            </div>
        </a>
    `).join("");
}

function addCustomContact() {
    const name = prompt("Enter Contact Name (e.g., Mom, Sister, Best Friend):");
    if (!name) return;
    const phone = prompt(`Enter phone number for ${name}:`);
    if (!phone) return;

    const contacts = getSavedContacts();
    contacts.push({ name: name.trim(), phone: phone.trim(), relation: "Trusted" });
    saveContacts(contacts);
    showToast(`🌸 Added ${name} to your quick dial contacts!`);
}

function logDialAttempt(name, phone) {
    console.log(`Dialing emergency contact: ${name} (${phone})`);
}

// --- Cute Toast Notifications ---
function showToast(msg) {
    let toast = document.getElementById("app-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "app-toast";
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            background: #2D3142;
            color: #FFFFFF;
            padding: 12px 24px;
            border-radius: 50px;
            font-size: 0.88rem;
            font-weight: 600;
            box-shadow: 0 8px 24px rgba(0,0,0,0.25);
            z-index: 9999;
            transition: opacity 0.3s ease;
            pointer-events: none;
            max-width: 90%;
            text-align: center;
        `;
        document.body.appendChild(toast);
    }
    toast.innerText = msg;
    toast.style.opacity = "1";
    setTimeout(() => {
        toast.style.opacity = "0";
    }, 3200);
}

function escapeHtml(text) {
    if (!text) return "";
    return text.replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[m]);
}
