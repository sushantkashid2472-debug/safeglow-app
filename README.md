# 🌸 SafeGlow — Live Safety Companion & Real-Time Tracking

> **A comforting, cute, and deployment-ready personal safety companion built especially for women walking alone or feeling anxious on roads.**

SafeGlow lets anyone heading out alone start a live walk session, stream their real-time GPS location via a single link (no app install needed for the guardian), send instant high-priority SOS siren alerts, capture back-camera surroundings photos to verify nearby landmarks, simulate realistic fake phone calls to deter unwanted strangers, and follow calming 4-7-8 breathing exercises during panic moments.

---

## ✨ Key Features

### 1. 📍 Real-Time Live GPS Tracking via Shareable Link
- Walker starts a walk session with their name & destination.
- Generates a unique tracking link (e.g. `https://your-domain.com/track/glow-a7b3c9`).
- **No app download required for the guardian**: They can view the live interactive OpenStreetMap on any phone, tablet, or laptop.
- Breadcrumb route trail showing past path, current pulsating radar pin, GPS accuracy circle, and battery percentage.
- Real-time bidirectional updates via WebSockets with seamless REST fallback.

### 2. 🚨 High-Priority SOS Emergency System
- Prominent, easy-to-tap SOS centerpiece.
- **Urgent audio siren**: Built-in Web Audio API emergency siren sounds immediately on both walker and guardian devices.
- Flashing red warning banner on the guardian's screen displaying the exact live coordinates ready to read aloud to 911 / 112 dispatchers.
- One-tap button to copy coordinates with address context for police or WhatsApp.

### 3. 📸 Back-Camera Surroundings Snapshot Feed
- Walker can tap **"📸 Back Camera"** to take a live photo of their physical surroundings using the rear camera (`facingMode: environment`).
- Ideal for showing street signs, shop names, landmarks, or vehicle license plates.
- Automatically uploaded and broadcasted to the guardian's live feed in real-time with timestamp and coordinate tags.
- Full-screen lightbox modal for high-detail inspection.

### 4. 📞 Emergency Quick Dial Contacts
- Pre-configured one-tap emergency services:
  - **112**: Universal Emergency Dispatch (India & EU / standard mobile emergency)
  - **1091**: National Women Helpline
  - **100 / 911**: Police Control Room
  - **108**: Emergency Ambulance & Paramedics
- Walker can add custom trusted contacts (e.g., Mom, Sister, Best Friend, Roommate) saved locally and shared with the guardian.

### 5. 🌿 Anxiety-Relief & Deterrent Tools
- **Realistic Fake Call Simulator**: Rings the phone with a realistic incoming call screen ("Mom 💕" or "Dad"), vibrating ringtone, and active connected call screen with a duration timer to help deter suspicious approaches.
- **4-7-8 Calming Breathing Visualizer**: Smooth pulsing guide (4s Inhale, 7s Hold, 8s Exhale) to ground the user during racing heartbeat or panic attacks.
- **Pastel & Cute Aesthetic**: Soft blush rose, cozy lilac, and calming sage tones with comforting micro-copy to reduce feelings of isolation.
- **Night Mode Toggle**: Switch between cute pastel daylight mode and high-contrast dark mode for night walks.

---

## 🚀 Quick Start (Running Locally)

### 1. Clone & Enter Directory
```bash
cd C:\Users\sushant\.gemini\antigravity\scratch\safeglow-app
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Start the Server
```bash
python run.py
```
This automatically starts Uvicorn and prints your local PC and Wi-Fi addresses:
```text
🌸  SAFEGLOW - Live Safety & Anxiety Companion  🌸
 ▸ Local (on this PC):   http://localhost:8000
 ▸ Mobile (Same Wi-Fi):  http://192.168.1.XX:8000
 ▸ Health Check:         http://localhost:8000/health
```

---

## 📱 Testing on Your Mobile Phone

1. Connect your phone and PC to the **same Wi-Fi network**.
2. On your phone's browser (Safari on iPhone or Chrome on Android), navigate to:
   ```
   http://<YOUR_PC_IP>:8000
   ```
3. Grant **Location** and **Camera** permissions when prompted.
4. Tap **"Start Safe Walk & Share Link"**.
5. Copy the generated link or open it on another browser/device to view the **Guardian Live Map**!

> **Tip for remote sharing over the internet:**
> To test with a friend far away without deploying yet, run a free Cloudflare Tunnel or ngrok:
> ```bash
> npx localtunnel --port 8000
> # or
> ngrok http 8000
> ```

---

## ☁️ Deployment Ready

SafeGlow is completely self-contained with zero external database dependencies (uses embedded SQLite):

### Option A: 1-Click Deployment on Render.com (Free)
1. Push this repository to GitHub.
2. In [Render.com](https://render.com), click **New +** > **Blueprint**.
3. Select your repository. The included `render.yaml` will automatically configure:
   - Python environment
   - Dependency installation
   - Uvicorn start command

### Option B: Railway / Heroku
A `Procfile` is pre-configured:
```bash
web: uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

### Option C: Docker Container
Build and run anywhere with Docker:
```bash
docker build -t safeglow .
docker run -p 8000:8000 safeglow
```

---

## 🧪 Automated Testing

SafeGlow includes a full pytest suite covering session creation, GPS breadcrumbs, SOS lifecycle, camera snapshots, and static template delivery:

```bash
python -m pytest tests/test_api.py -v
```

All 5 test suites pass with 100% success rate:
- `test_health_check`
- `test_serve_html_pages`
- `test_session_lifecycle_and_location`
- `test_sos_trigger_and_resolve`
- `test_camera_snapshot_upload`

---

## 📂 Project Architecture

```
safeglow-app/
├── app/
│   ├── database.py       # SQLite persistence (sessions, coordinates, SOS, snapshots)
│   ├── models.py         # Pydantic data schemas
│   ├── main.py           # FastAPI server + WebSockets + REST API + Static mounts
│   ├── static/
│   │   ├── css/
│   │   │   └── style.css # Cute pastel styling, animations, mobile-first responsiveness
│   │   ├── js/
│   │   │   ├── audio.js  # Web Audio API synthesizer (siren, ringtone, chimes)
│   │   │   ├── app.js    # Walker companion logic (GPS, camera, fake call, SOS)
│   │   │   └── track.js  # Guardian map tracking (Leaflet, real-time WebSocket)
│   │   └── uploads/      # Stored surroundings snapshot photos
│   └── templates/
│       ├── index.html    # Walker companion interface
│       └── track.html    # Guardian live tracking interface
├── tests/
│   └── test_api.py       # Automated test suite
├── Dockerfile            # Container deployment specification
├── render.yaml           # 1-Click Render.com deployment spec
├── Procfile              # Heroku / Railway deploy file
├── requirements.txt      # Python dependencies
├── run.py                # Local runner with Wi-Fi IP display
└── README.md             # Documentation
```
