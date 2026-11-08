# Deletes only TEST_ records created for UI device TEST_ui_device_t1 (by id)
import requests
from test_posemate_api import BASE
H = {"X-Device-Id": "TEST_ui_device_t1"}
for p in requests.get(f"{BASE}/projects", headers=H).json():
    if p["name"].startswith("TEST_"):
        print("del project", p["id"], requests.delete(f"{BASE}/projects/{p['id']}", headers=H).status_code)
for p in requests.get(f"{BASE}/presets", headers=H).json():
    if p["name"].startswith("TEST_"):
        print("del preset", p["id"], requests.delete(f"{BASE}/presets/{p['id']}", headers=H).status_code)
for s in requests.get(f"{BASE}/abya/sessions", headers=H).json():
    print("del session", s["id"], requests.delete(f"{BASE}/abya/sessions/{s['id']}", headers=H).status_code)
