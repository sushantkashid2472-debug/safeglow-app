"""
SafeGlow Runner
Starts the FastAPI application and displays local network URLs
so you can instantly test on your phone over Wi-Fi.
"""

import socket
import uvicorn
import os
import sys

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    local_ip = get_local_ip()
    port = int(os.environ.get("PORT", 8000))

    print("\n" + "=" * 60)
    print("[*] SAFEGLOW - Live Safety & Anxiety Companion")
    print("=" * 60)
    print(f" > Local (on this PC):   http://localhost:{port}")
    print(f" > Mobile (Same Wi-Fi):  http://{local_ip}:{port}")
    print(f" > Health Check:         http://localhost:{port}/health")
    print("=" * 60)
    print("To test on your mobile phone:")
    print("   1. Ensure phone & PC are on the same Wi-Fi")
    print(f"   2. Open Chrome/Safari on phone and go to: http://{local_ip}:{port}")
    print("=" * 60 + "\n")

    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True)
