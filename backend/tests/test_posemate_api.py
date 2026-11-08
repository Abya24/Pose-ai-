# PoseMate AI backend regression tests (photos, vision, edit, AI, compose, presets, projects, ABYA, content)
import io
import json
import os
import uuid

import pytest
import requests
from PIL import Image


def _base():
    url = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
    if not url:
        for line in open("/app/frontend/.env"):
            if line.startswith("EXPO_PUBLIC_BACKEND_URL=") or line.startswith("EXPO_BACKEND_URL="):
                url = line.split("=", 1)[1].strip().strip('"')
    return url.rstrip("/")


BASE = _base() + "/api"
DEV = "TEST_dev_" + uuid.uuid4().hex[:8]
OTHER = "TEST_other_" + uuid.uuid4().hex[:8]
H = {"X-Device-Id": DEV}
PERSON_URL = "https://images.unsplash.com/photo-1772450236019-7b1c970b57ad?fm=jpg&w=800"


@pytest.fixture(scope="session")
def person_bytes():
    r = requests.get(PERSON_URL, timeout=30)
    if r.status_code != 200:
        img = Image.new("RGB", (600, 800), (120, 90, 200))
        b = io.BytesIO(); img.save(b, "JPEG"); return b.getvalue()
    return r.content


@pytest.fixture(scope="session")
def photo(person_bytes):
    r = requests.post(f"{BASE}/photos", headers=H, files={"file": ("p.jpg", person_bytes, "image/jpeg")}, timeout=60)
    assert r.status_code == 200, r.text
    return r.json()


# ---- photos
def test_upload_and_fetch_photo(photo):
    assert photo["id"] and photo["width"] > 0
    r = requests.get(f"{BASE}/photos/{photo['id']}/file", params={"d": DEV}, timeout=30)
    assert r.status_code == 200 and r.headers["content-type"].startswith("image/")
    r2 = requests.get(f"{BASE}/photos/{photo['id']}/file", params={"d": OTHER}, timeout=30)
    assert r2.status_code in (403, 404)


def test_upload_requires_device(person_bytes):
    r = requests.post(f"{BASE}/photos", files={"file": ("p.jpg", person_bytes, "image/jpeg")}, timeout=30)
    assert r.status_code in (400, 401, 422)


def test_upload_png_and_bad_file():
    img = Image.new("RGBA", (300, 200), (10, 200, 30, 255)); b = io.BytesIO(); img.save(b, "PNG")
    r = requests.post(f"{BASE}/photos", headers=H, files={"file": ("a.png", b.getvalue(), "image/png")}, timeout=30)
    assert r.status_code == 200 and r.json()["width"] == 300
    r = requests.post(f"{BASE}/photos", headers=H, files={"file": ("a.txt", b"hello", "text/plain")}, timeout=30)
    assert r.status_code == 400


# ---- vision
def test_vision_analyze_person(person_bytes):
    r = requests.post(f"{BASE}/vision/analyze", files={"file": ("p.jpg", person_bytes, "image/jpeg")}, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "lighting" in d and "mean" in d["lighting"]
    print("persons:", len(d["persons"]))
    assert len(d["persons"]) >= 1
    assert len(d["persons"][0]["landmarks"]) == 33


# ---- edit render
PARAMS = {"filter": "cinematic", "adjust": {"exposure": 10, "contrast": 15, "saturation": 20, "vignette": 30, "sharpness": 20},
          "crop": {"aspect": "4:5", "zoom": 1.2, "cx": 0.5, "cy": 0.5}, "rotate": 90, "flipH": True,
          "texts": [{"text": "नमस्ते दुनिया", "x": 0.5, "y": 0.2, "size": 0.07, "color": "#FFD700"}, {"text": "Hello", "x": 0.5, "y": 0.8}],
          "stickers": [{"glyph": "★", "x": 0.3, "y": 0.3}], "frame": {"style": "white"}}


def test_edit_render_preview(photo):
    r = requests.post(f"{BASE}/edit/render", headers=H, json={"photo_id": photo["id"], "params": PARAMS, "preview": True}, timeout=60)
    assert r.status_code == 200, r.text
    assert r.json()["image"].startswith("data:image/jpeg;base64,")


def test_edit_render_export(photo):
    r = requests.post(f"{BASE}/edit/render", headers=H, json={"photo_id": photo["id"], "params": PARAMS, "preview": False}, timeout=90)
    assert r.status_code == 200, r.text
    d = r.json(); assert d["id"] != photo["id"]
    f = requests.get(f"{BASE}/photos/{d['id']}/file", params={"d": DEV}, timeout=30)
    assert f.status_code == 200


def test_edit_suggest(photo):
    r = requests.post(f"{BASE}/edit/suggest", headers=H, json={"photo_id": photo["id"]}, timeout=120)
    assert r.status_code == 200, r.text
    d = r.json(); print(d)
    assert "adjust" in d and "filter" in d


# ---- AI processing (Nano Banana)
@pytest.mark.parametrize("mode,prompt", [("enhance", None), ("remove_bg", None), ("blur_bg", None), ("replace_bg", "a sunny beach at golden hour")])
def test_ai_process(photo, mode, prompt):
    body = {"photo_id": photo["id"], "mode": mode}
    if prompt:
        body["prompt"] = prompt
    r = requests.post(f"{BASE}/ai/process", headers=H, json=body, timeout=180)
    assert r.status_code == 200, r.text
    d = r.json(); assert d["id"] and d["kind"] == "ai"


def test_ai_process_validation(photo):
    assert requests.post(f"{BASE}/ai/process", headers=H, json={"photo_id": photo["id"], "mode": "xx"}, timeout=30).status_code == 400
    assert requests.post(f"{BASE}/ai/process", headers=H, json={"photo_id": photo["id"], "mode": "replace_bg"}, timeout=30).status_code == 400


# ---- compose
def _page(pid):
    return {"background": "#120a24", "elements": [
        {"type": "image", "photo_id": pid, "x": 0, "y": 0, "w": 0.5, "h": 1, "radius": 0.02, "border": 0.005},
        {"type": "text", "text": "TEST कैरोसेल", "x": 0.6, "y": 0.4, "size": 0.06, "color": "#FFFFFF"}]}


def test_compose_carousel(photo):
    r = requests.post(f"{BASE}/compose/render", headers=H, json={"canvas": {"mode": "carousel", "slides": 3, "aspect": "4:5", "pages": [_page(photo["id"])]}}, timeout=120)
    assert r.status_code == 200, r.text
    ph = r.json()["photos"]; assert len(ph) == 3
    assert ph[0]["width"] == 1080 and ph[0]["height"] == 1350


def test_compose_collage(photo):
    r = requests.post(f"{BASE}/compose/render", headers=H, json={"canvas": {"mode": "collage", "aspect": "1:1", "pages": [_page(photo["id"]), _page(photo["id"])]}}, timeout=120)
    assert r.status_code == 200, r.text
    assert len(r.json()["photos"]) == 2
    assert requests.post(f"{BASE}/compose/render", headers=H, json={"canvas": {"pages": []}}, timeout=30).status_code == 400


# ---- presets
def test_presets_crud():
    r = requests.post(f"{BASE}/presets", headers=H, json={"name": "TEST_preset", "params": {"filter": "warm"}}, timeout=30)
    assert r.status_code == 200; pid = r.json()["id"]
    assert any(p["id"] == pid for p in requests.get(f"{BASE}/presets", headers=H, timeout=30).json())
    assert all(p["id"] != pid for p in requests.get(f"{BASE}/presets", headers={"X-Device-Id": OTHER}, timeout=30).json())
    assert requests.delete(f"{BASE}/presets/{pid}", headers=H, timeout=30).status_code == 200
    assert all(p["id"] != pid for p in requests.get(f"{BASE}/presets", headers=H, timeout=30).json())


# ---- projects
def test_projects_crud(photo):
    r = requests.post(f"{BASE}/projects", headers=H, json={"name": "TEST_proj", "type": "photo", "photos": [photo["id"]]}, timeout=30)
    assert r.status_code == 200; p = r.json(); pid = p["id"]
    assert p["cover"] == photo["id"] and "_id" not in p and "device_id" not in p
    assert requests.get(f"{BASE}/projects/{pid}", headers={"X-Device-Id": OTHER}, timeout=30).status_code == 404
    r = requests.patch(f"{BASE}/projects/{pid}", headers=H, json={"name": "TEST_renamed", "edits": {"filter": "mono"}}, timeout=30)
    assert r.status_code == 200 and r.json()["name"] == "TEST_renamed"
    g = requests.get(f"{BASE}/projects/{pid}", headers=H, timeout=30).json()
    assert g["edits"]["filter"] == "mono"
    d = requests.post(f"{BASE}/projects/{pid}/duplicate", headers=H, timeout=30)
    assert d.status_code == 200 and d.json()["name"] == "TEST_renamed (copy)" and "_id" not in d.json()
    ids = [x["id"] for x in requests.get(f"{BASE}/projects", headers=H, timeout=30).json()]
    assert pid in ids and d.json()["id"] in ids
    for x in (pid, d.json()["id"]):
        assert requests.delete(f"{BASE}/projects/{x}", headers=H, timeout=30).status_code == 200
    assert requests.get(f"{BASE}/projects/{pid}", headers=H, timeout=30).status_code == 404


# ---- ABYA chat SSE
def _chat(body):
    r = requests.post(f"{BASE}/abya/chat", headers=H, json=body, stream=True, timeout=120)
    assert r.status_code == 200, r.text
    events = []
    for line in r.iter_lines(decode_unicode=True):
        if line and line.startswith("data:"):
            events.append(json.loads(line[5:].strip()))
    return events


@pytest.mark.parametrize("lang", ["Hindi", "Bhojpuri", "Hinglish"])
def test_abya_chat_languages(lang):
    ev = _chat({"message": "TEST_ golden hour portrait tips in 2 lines", "language": lang})
    sid = ev[0]["session_id"]
    text = "".join(e.get("delta", "") for e in ev)
    print(lang, text[:200])
    assert any(e.get("done") for e in ev), ev[-1]
    assert len(text) > 10
    msgs = requests.get(f"{BASE}/abya/sessions/{sid}/messages", headers=H, timeout=30).json()
    assert [m["role"] for m in msgs] == ["user", "assistant"]
    ev2 = _chat({"session_id": sid, "message": "and indoors?", "language": lang})
    assert any(e.get("done") for e in ev2)
    assert any(s["id"] == sid for s in requests.get(f"{BASE}/abya/sessions", headers=H, timeout=30).json())
    assert requests.get(f"{BASE}/abya/sessions/{sid}/messages", headers={"X-Device-Id": OTHER}, timeout=30).status_code == 404
    assert requests.delete(f"{BASE}/abya/sessions/{sid}", headers=H, timeout=30).status_code == 200
    assert requests.get(f"{BASE}/abya/sessions/{sid}/messages", headers=H, timeout=30).status_code == 404


def test_abya_chat_with_photo(photo):
    ev = _chat({"message": "TEST_ how is the lighting in this photo?", "language": "English", "photo_id": photo["id"]})
    assert any(e.get("done") for e in ev), ev[-1]
    requests.delete(f"{BASE}/abya/sessions/{ev[0]['session_id']}", headers=H, timeout=30)


# ---- TTS / STT
def test_tts_and_stt_roundtrip():
    r = requests.post(f"{BASE}/abya/tts", json={"text": "Hello, keep your chin slightly down and look at the light."}, timeout=90)
    assert r.status_code == 200, r.text
    url = _base() + r.json()["url"]
    a = requests.get(url, timeout=30)
    assert a.status_code == 200 and a.headers["content-type"] == "audio/mpeg" and len(a.content) > 2000
    s = requests.post(f"{BASE}/abya/stt", files={"audio": ("rec.mp3", a.content, "audio/mpeg")}, data={"language": "English"}, timeout=90)
    assert s.status_code == 200, s.text
    print("STT:", s.json())
    assert "chin" in s.json()["text"].lower()


# ---- content generation
def test_content_generate(photo):
    r = requests.post(f"{BASE}/content/generate", headers=H, json={"photo_id": photo["id"], "language": "Hinglish", "tone": "aesthetic"}, timeout=120)
    assert r.status_code == 200, r.text
    d = r.json(); print(d)
    assert len(d["captions"]) >= 3 and len(d["hashtags"]) >= 10 and d["story_text"] and d["description"]
    assert requests.post(f"{BASE}/content/generate", headers=H, json={}, timeout=30).status_code == 400
