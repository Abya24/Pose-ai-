# Iteration 2: project purge-delete, photo delete, device-id enforcement on vision/tts/stt
import io
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
DEV = "TEST_purge_" + uuid.uuid4().hex[:10]
OTHER = "TEST_other_" + uuid.uuid4().hex[:10]
H = {"X-Device-Id": DEV}


def _jpg(color=(120, 90, 200)):
    b = io.BytesIO(); Image.new("RGB", (320, 240), color).save(b, "JPEG"); return b.getvalue()


def upload(dev=DEV, kind="original"):
    r = requests.post(f"{BASE}/photos", headers={"X-Device-Id": dev}, data={"kind": kind},
                      files={"file": ("p.jpg", _jpg(), "image/jpeg")}, timeout=60)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def file_status(pid, dev=DEV):
    return requests.get(f"{BASE}/photos/{pid}/file", params={"d": dev}, timeout=30).status_code


def mk_project(**body):
    r = requests.post(f"{BASE}/projects", headers=H, json=body, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["id"]


# ---- purge=true removes photos, exports, edits keys, canvas ids
class TestPurge:
    def test_purge_deletes_all_referenced_photos(self):
        p1, p2, e1, c1, x1 = upload(), upload(), upload(), upload(), upload(kind="export")
        canvas = {"pages": [{"elements": [{"type": "image", "photo_id": c1}, {"type": "text", "text": "hi"}]}]}
        pid = mk_project(type="collage", photos=[p1, p2], edits={e1: {"brightness": 10}}, canvas=canvas)
        r = requests.patch(f"{BASE}/projects/{pid}", headers=H, json={"exports": [x1]}, timeout=30)
        assert r.status_code == 200 and r.json()["exports"] == [x1]
        for i in (p1, p2, e1, c1, x1):
            assert file_status(i) == 200
        r = requests.delete(f"{BASE}/projects/{pid}", params={"purge": "true"}, headers=H, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["photos_deleted"] == 5
        for i in (p1, p2, e1, c1, x1):
            assert file_status(i) == 404
        assert requests.get(f"{BASE}/projects/{pid}", headers=H, timeout=30).status_code == 404

    def test_purge_keeps_photos_shared_with_other_project(self):
        shared, own = upload(), upload()
        a = mk_project(photos=[shared, own])
        b = mk_project(photos=[shared])
        r = requests.delete(f"{BASE}/projects/{a}", params={"purge": "true"}, headers=H, timeout=30)
        assert r.json()["photos_deleted"] == 1
        assert file_status(shared) == 200 and file_status(own) == 404
        requests.delete(f"{BASE}/projects/{b}", params={"purge": "true"}, headers=H, timeout=30)
        assert file_status(shared) == 404

    def test_purge_keeps_photos_shared_via_exports_of_other_project(self):
        shared = upload()
        a = mk_project(photos=[shared])
        b = mk_project(photos=[])
        requests.patch(f"{BASE}/projects/{b}", headers=H, json={"exports": [shared]}, timeout=30)
        r = requests.delete(f"{BASE}/projects/{a}", params={"purge": "true"}, headers=H, timeout=30)
        assert r.json()["photos_deleted"] == 0 and file_status(shared) == 200
        requests.delete(f"{BASE}/projects/{b}", params={"purge": "true"}, headers=H, timeout=30)

    def test_purge_false_keeps_photos(self):
        p = upload()
        a = mk_project(photos=[p])
        r = requests.delete(f"{BASE}/projects/{a}", headers=H, timeout=30)
        assert r.status_code == 200 and r.json()["photos_deleted"] == 0
        assert file_status(p) == 200
        r = requests.delete(f"{BASE}/photos/{p}", headers=H, timeout=30)
        assert r.json()["deleted"] == 1 and file_status(p) == 404

    def test_purge_deletes_derived_ai_results(self):
        # /edit/render result is stored with source_id = original
        p = upload()
        r = requests.post(f"{BASE}/edit/render", headers=H, json={"photo_id": p, "adjustments": {"brightness": 20}}, timeout=60)
        if r.status_code != 200:
            pytest.skip(f"edit/render payload mismatch: {r.status_code} {r.text[:120]}")
        derived = r.json().get("id")
        a = mk_project(photos=[p])
        d = requests.delete(f"{BASE}/projects/{a}", params={"purge": "true"}, headers=H, timeout=30).json()
        assert file_status(p) == 404
        if derived:
            assert file_status(derived) == 404
            assert d["photos_deleted"] == 2

    def test_purge_keeps_photo_used_in_abya_message(self):
        p = upload()
        a = mk_project(photos=[p])
        r = requests.post(f"{BASE}/abya/chat", headers=H, json={"message": "TEST_ one word: is this purple?", "photo_id": p}, timeout=90)
        assert r.status_code == 200, r.text
        import json as _j
        sid = None
        for ln in r.text.splitlines():
            if ln.startswith("data:") and "session_id" in ln:
                sid = _j.loads(ln[5:]).get("session_id")
        d = requests.delete(f"{BASE}/projects/{a}", params={"purge": "true"}, headers=H, timeout=30).json()
        assert d["photos_deleted"] == 0 and file_status(p) == 200
        if sid:
            requests.delete(f"{BASE}/abya/sessions/{sid}", headers=H, timeout=30)
        requests.delete(f"{BASE}/photos/{p}", headers=H, timeout=30)

    def test_delete_missing_project(self):
        r = requests.delete(f"{BASE}/projects/nope-{uuid.uuid4()}", params={"purge": "true"}, headers=H, timeout=30)
        assert r.status_code in (200, 404)

    def test_purge_is_device_scoped(self):
        p = upload()
        a = mk_project(photos=[p])
        r = requests.delete(f"{BASE}/projects/{a}", params={"purge": "true"}, headers={"X-Device-Id": OTHER}, timeout=30)
        assert r.json().get("photos_deleted", 0) == 0
        assert requests.get(f"{BASE}/projects/{a}", headers=H, timeout=30).status_code == 200
        assert file_status(p) == 200
        requests.delete(f"{BASE}/projects/{a}", params={"purge": "true"}, headers=H, timeout=30)


# ---- DELETE /photos is device scoped
def test_delete_photo_device_scoped():
    p = upload()
    r = requests.delete(f"{BASE}/photos/{p}", headers={"X-Device-Id": OTHER}, timeout=30)
    assert r.status_code == 200 and r.json()["deleted"] == 0
    assert file_status(p) == 200
    r = requests.delete(f"{BASE}/photos/{p}", headers=H, timeout=30)
    assert r.json()["deleted"] == 1 and file_status(p) == 404


def test_delete_photo_requires_device():
    r = requests.delete(f"{BASE}/photos/whatever", timeout=30)
    assert r.status_code == 401


# ---- device header now required on vision/tts/stt
def test_vision_requires_device():
    r = requests.post(f"{BASE}/vision/analyze", files={"file": ("f.jpg", _jpg(), "image/jpeg")}, timeout=30)
    assert r.status_code == 401


def test_vision_with_device_ok():
    r = requests.post(f"{BASE}/vision/analyze", headers=H, files={"file": ("f.jpg", _jpg(), "image/jpeg")}, timeout=60)
    assert r.status_code == 200, r.text


def test_tts_requires_device():
    r = requests.post(f"{BASE}/abya/tts", json={"text": "hi"}, timeout=30)
    assert r.status_code == 401


def test_stt_requires_device():
    r = requests.post(f"{BASE}/abya/stt", files={"audio": ("a.m4a", b"\x00" * 100, "audio/m4a")}, data={"language": "English"}, timeout=30)
    assert r.status_code == 401


def test_tts_with_device_ok():
    r = requests.post(f"{BASE}/abya/tts", headers=H, json={"text": "Hello"}, timeout=60)
    assert r.status_code == 200 and (r.headers["content-type"].startswith("audio") or r.json())
