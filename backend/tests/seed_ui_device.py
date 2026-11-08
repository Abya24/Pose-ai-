# Creates TEST_ projects for a dedicated UI test device (photo + carousel)
import json
import sys
import requests
sys.path.insert(0, "/app/backend/tests")
from test_posemate_api import BASE, PERSON_URL

dev = sys.argv[1]
H = {"X-Device-Id": dev}
img = requests.get(PERSON_URL, timeout=30).content
ph = requests.post(f"{BASE}/photos", headers=H, files={"file": ("p.jpg", img, "image/jpeg")}).json()
ph2 = requests.post(f"{BASE}/photos", headers=H, files={"file": ("p2.jpg", img, "image/jpeg")}).json()
p1 = requests.post(f"{BASE}/projects", headers=H, json={"name": "TEST_ui_photo", "type": "photo", "photos": [ph["id"]]}).json()
p2 = requests.post(f"{BASE}/projects", headers=H, json={"name": "TEST_ui_carousel", "type": "carousel", "photos": [ph["id"], ph2["id"]]}).json()
p3 = requests.post(f"{BASE}/projects", headers=H, json={"name": "TEST_ui_collage", "type": "collage", "photos": [ph["id"], ph2["id"]]}).json()
print(json.dumps({"photo": p1["id"], "carousel": p2["id"], "collage": p3["id"]}))
