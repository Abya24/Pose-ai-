import asyncio
import base64
import io
import json
import logging
import os
import re
import tempfile
import uuid
from collections import OrderedDict
from contextlib import suppress
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import requests
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.responses import Response, StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps
from pydantic import BaseModel, Field
from pymongo import ASCENDING, DESCENDING, IndexModel
from starlette.concurrency import run_in_threadpool
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from emergentintegrations.llm.chat import ImageContent, LlmChat, StreamDone, TextDelta, UserMessage  # noqa: E402
from emergentintegrations.llm.openai import OpenAISpeechToText, OpenAITextToSpeech  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("posemate")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
CHAT_MODEL = "gemini-3.1-pro-preview"
IMAGE_MODEL = "gemini-3.1-flash-image-preview"
FONTS = ROOT_DIR / "fonts"
POSE_MODEL = ROOT_DIR / "models" / "pose_landmarker_lite.task"

INDEXES: dict[str, list[IndexModel]] = {
    "photos": [IndexModel([("id", ASCENDING)], name="id", unique=True), IndexModel([("device_id", ASCENDING)], name="device")],
    "projects": [IndexModel([("id", ASCENDING)], name="id", unique=True), IndexModel([("device_id", ASCENDING), ("updated_at", DESCENDING)], name="device_updated")],
    "presets": [IndexModel([("id", ASCENDING)], name="id", unique=True), IndexModel([("device_id", ASCENDING)], name="device")],
    "abya_sessions": [IndexModel([("id", ASCENDING)], name="id", unique=True), IndexModel([("device_id", ASCENDING), ("updated_at", DESCENDING)], name="device_updated")],
    "abya_messages": [IndexModel([("session_id", ASCENDING), ("created_at", ASCENDING)], name="session_created")],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------- object storage
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = "posemate-ai"
_storage_key: Optional[str] = None


def init_storage() -> str:
    global _storage_key
    if _storage_key:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": LLM_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    global _storage_key
    for attempt in range(2):
        key = init_storage()
        resp = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
        if resp.status_code == 503 and attempt == 0:
            _storage_key = None
            continue
        if resp.status_code == 402:
            raise HTTPException(402, "Storage credits exhausted. Please top up your balance.")
        resp.raise_for_status()
        return resp.json()
    raise HTTPException(503, "Storage unavailable")


def get_object(path: str) -> bytes:
    global _storage_key
    for attempt in range(2):
        key = init_storage()
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
        if resp.status_code == 503 and attempt == 0:
            _storage_key = None
            continue
        resp.raise_for_status()
        return resp.content
    raise HTTPException(503, "Storage unavailable")


_bytes_cache: "OrderedDict[str, bytes]" = OrderedDict()


async def photo_bytes(photo: dict) -> bytes:
    pid = photo["id"]
    if pid in _bytes_cache:
        _bytes_cache.move_to_end(pid)
        return _bytes_cache[pid]
    data = await run_in_threadpool(get_object, photo["path"])
    _bytes_cache[pid] = data
    while len(_bytes_cache) > 40:
        _bytes_cache.popitem(last=False)
    return data


async def get_photo(photo_id: str, device_id: str) -> dict:
    photo = await db.photos.find_one({"id": photo_id, "device_id": device_id}, {"_id": 0})
    if not photo:
        raise HTTPException(404, "Photo not found")
    return photo


def open_image(data: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img)
    return img.convert("RGB")


def to_jpeg(img: Image.Image, quality: int = 92) -> bytes:
    buf = io.BytesIO()
    img.convert("RGB").save(buf, "JPEG", quality=quality, optimize=True)
    return buf.getvalue()


async def store_photo(device_id: str, data: bytes, kind: str, source_id: Optional[str] = None, content_type: str = "image/jpeg") -> dict:
    img = await run_in_threadpool(open_image, data)
    pid = str(uuid.uuid4())
    ext = "png" if content_type == "image/png" else "jpg"
    path = f"{APP_NAME}/uploads/{device_id}/{pid}.{ext}"
    result = await run_in_threadpool(put_object, path, data, content_type)
    doc = {"id": pid, "device_id": device_id, "path": result.get("path", path), "kind": kind, "source_id": source_id,
           "width": img.width, "height": img.height, "content_type": content_type, "created_at": now_iso()}
    await db.photos.insert_one(dict(doc))
    _bytes_cache[pid] = data
    return public_photo(doc)


def public_photo(doc: dict) -> dict:
    return {"id": doc["id"], "width": doc["width"], "height": doc["height"], "kind": doc["kind"],
            "source_id": doc.get("source_id"), "url": f"/api/photos/{doc['id']}/file"}


# ---------------------------------------------------------------- fonts
_font_cache: Dict[tuple, ImageFont.FreeTypeFont] = {}


def font_for(text: str, size: int, kind: str = "display") -> ImageFont.FreeTypeFont:
    size = max(8, int(size))
    if re.search(r"[\u0900-\u097F]", text):
        name = "NotoSansDevanagari.ttf"
    elif kind == "sticker":
        name = "FreeSerif.ttf"
    else:
        name = "SpaceGrotesk.ttf"
    key = (name, size)
    if key not in _font_cache:
        f = ImageFont.truetype(str(FONTS / name), size)
        with suppress(Exception):
            f.set_variation_by_name("Bold")
        _font_cache[key] = f
    return _font_cache[key]


def hex_rgb(h: str, default=(255, 255, 255)) -> tuple:
    try:
        h = h.lstrip("#")
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    except Exception:
        return default


# ---------------------------------------------------------------- photo editing (non-destructive params)
ASPECTS = {"1:1": 1.0, "4:5": 0.8, "3:4": 0.75, "9:16": 9 / 16, "16:9": 16 / 9, "4:3": 4 / 3}


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def apply_filter(arr: np.ndarray, name: str) -> np.ndarray:
    L = (arr[..., 0] * 0.299 + arr[..., 1] * 0.587 + arr[..., 2] * 0.114)[..., None]
    if name == "mono":
        return np.repeat(L, 3, axis=2)
    if name == "noir":
        g = np.clip((L - 0.5) * 1.45 + 0.48, 0, 1)
        return np.repeat(g, 3, axis=2)
    if name == "vivid":
        return np.clip(L + (arr - L) * 1.35, 0, 1) * 1.02
    if name == "warm":
        return arr * np.array([1.08, 1.0, 0.88])
    if name == "cool":
        return arr * np.array([0.9, 1.0, 1.1])
    if name == "vintage":
        sep = np.concatenate([L * 1.07 + 0.05, L * 0.95 + 0.03, L * 0.75], axis=2)
        return arr * 0.45 + sep * 0.55
    if name == "film":
        out = arr * 0.9 + 0.06
        return out * np.array([1.02, 1.0, 0.94])
    if name == "fade":
        return arr * 0.82 + 0.12
    if name == "cinematic":
        shadows = 1 - smoothstep(0.0, 0.5, L)
        highs = smoothstep(0.5, 1.0, L)
        out = arr + shadows * np.array([-0.03, 0.02, 0.07]) + highs * np.array([0.07, 0.02, -0.05])
        return (out - 0.5) * 1.12 + 0.5
    if name == "golden":
        return np.clip(arr * np.array([1.1, 1.03, 0.85]) + 0.02, 0, 1)
    if name == "pastel":
        return np.clip(L + (arr - L) * 0.7, 0, 1) * 0.9 + 0.1
    return arr


def apply_edit(img: Image.Image, p: Dict[str, Any]) -> Image.Image:
    rot = int(p.get("rotate", 0)) % 360
    if rot:
        img = img.rotate(-rot, expand=True)
    if p.get("flipH"):
        img = ImageOps.mirror(img)
    if p.get("flipV"):
        img = ImageOps.flip(img)
    straighten = float(p.get("straighten", 0) or 0)
    if abs(straighten) > 0.05:
        w, h = img.size
        r = img.rotate(-straighten, resample=Image.BICUBIC, expand=False)
        a = abs(np.radians(straighten))
        scale = 1 / (np.cos(a) + max(w / h, h / w) * np.sin(a))
        cw, ch = int(w * scale), int(h * scale)
        img = r.crop(((w - cw) // 2, (h - ch) // 2, (w - cw) // 2 + cw, (h - ch) // 2 + ch))
    crop = p.get("crop") or {}
    aspect = crop.get("aspect", "original")
    zoom = max(1.0, float(crop.get("zoom", 1) or 1))
    if aspect in ASPECTS or zoom > 1.001:
        w, h = img.size
        target = ASPECTS.get(aspect, w / h)
        if w / h > target:
            ch, cw = h, h * target
        else:
            cw, ch = w, w / target
        cw, ch = cw / zoom, ch / zoom
        cx = float(crop.get("cx", 0.5)) * w
        cy = float(crop.get("cy", 0.5)) * h
        left = min(max(cx - cw / 2, 0), w - cw)
        top = min(max(cy - ch / 2, 0), h - ch)
        img = img.crop((int(left), int(top), int(left + cw), int(top + ch)))

    a = p.get("adjust") or {}
    arr = np.asarray(img).astype(np.float32) / 255.0
    flt = p.get("filter") or "none"
    if flt != "none":
        arr = np.clip(apply_filter(arr, flt), 0, 1)
    ex = float(a.get("exposure", 0))
    if ex:
        arr = arr * (2 ** (ex / 100 * 1.5))
    br = float(a.get("brightness", 0))
    if br:
        arr = arr + br / 100 * 0.25
    co = float(a.get("contrast", 0))
    if co:
        arr = (arr - 0.5) * (1 + co / 100) + 0.5
    hi, sh = float(a.get("highlights", 0)), float(a.get("shadows", 0))
    if hi or sh:
        L = np.clip(arr[..., 0] * 0.299 + arr[..., 1] * 0.587 + arr[..., 2] * 0.114, 0, 1)[..., None]
        arr = arr + hi / 100 * 0.3 * smoothstep(0.5, 1.0, L) + sh / 100 * 0.3 * (1 - smoothstep(0.0, 0.5, L))
    te = float(a.get("temperature", 0))
    if te:
        arr = arr + np.array([te / 100 * 0.12, 0, -te / 100 * 0.12])
    ti = float(a.get("tint", 0))
    if ti:
        arr = arr + np.array([ti / 100 * 0.05, -ti / 100 * 0.1, ti / 100 * 0.05])
    sa = float(a.get("saturation", 0))
    if sa:
        L = (arr[..., 0] * 0.299 + arr[..., 1] * 0.587 + arr[..., 2] * 0.114)[..., None]
        arr = L + (arr - L) * (1 + sa / 100)
    vi = float(a.get("vignette", 0))
    if vi:
        h, w = arr.shape[:2]
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        d = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2) / 1.4142
        mask = 1 - (vi / 100) * 0.85 * smoothstep(0.35, 1.0, d)
        arr = arr * mask[..., None]
    img = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8))

    dn = float(a.get("denoise", 0))
    if dn > 0:
        size = 3 if dn < 60 else 5
        img = Image.blend(img, img.filter(ImageFilter.MedianFilter(size)), min(1.0, dn / 100 * 1.2))
    shp = float(a.get("sharpness", 0))
    if shp > 0:
        img = img.filter(ImageFilter.UnsharpMask(radius=max(1, img.width / 600), percent=int(shp * 2.2), threshold=2))
    bl = float(a.get("blur", 0))
    if bl > 0:
        img = img.filter(ImageFilter.GaussianBlur(radius=bl / 100 * img.width / 80))

    w, h = img.size
    if p.get("texts") or p.get("stickers"):
        layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(layer)
        for t in p.get("texts") or []:
            txt = str(t.get("text", ""))[:200]
            if not txt:
                continue
            f = font_for(txt, float(t.get("size", 0.06)) * w)
            x, y = float(t.get("x", 0.5)) * w, float(t.get("y", 0.5)) * h
            if t.get("shadow", True):
                draw.multiline_text((x + 2, y + 2), txt, font=f, fill=(0, 0, 0, 140), anchor="mm", align="center")
            draw.multiline_text((x, y), txt, font=f, fill=hex_rgb(t.get("color", "#FFFFFF")) + (255,), anchor="mm", align="center")
        for s in p.get("stickers") or []:
            g = str(s.get("glyph", "★"))[:2]
            f = font_for(g, float(s.get("size", 0.12)) * w, "sticker")
            draw.text((float(s.get("x", 0.5)) * w, float(s.get("y", 0.5)) * h), g, font=f, fill=hex_rgb(s.get("color", "#FFFFFF")) + (255,), anchor="mm")
        img = Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")

    frame = (p.get("frame") or {}).get("style", "none")
    if frame != "none":
        b = int(min(w, h) * 0.04)
        if frame == "white":
            img = ImageOps.expand(img, border=b, fill=(255, 255, 255))
        elif frame == "black":
            img = ImageOps.expand(img, border=b, fill=(5, 5, 5))
        elif frame == "polaroid":
            canvas = Image.new("RGB", (w + 2 * b, h + b + int(b * 4.5)), (250, 250, 247))
            canvas.paste(img, (b, b))
            img = canvas
        elif frame == "film":
            fb = int(b * 2)
            canvas = Image.new("RGB", (w, h + 2 * fb), (12, 12, 12))
            canvas.paste(img, (0, fb))
            d = ImageDraw.Draw(canvas)
            hole_w, gap = int(fb * 0.45), int(fb * 0.9)
            for xx in range(gap // 2, w, gap):
                for yy in (fb * 0.3, h + fb + fb * 0.3):
                    d.rounded_rectangle((xx, yy, xx + hole_w, yy + fb * 0.4), radius=3, fill=(235, 235, 235))
            img = canvas
        elif frame == "gradient":
            canvas = Image.new("RGB", (w + 2 * b, h + 2 * b))
            grad = np.linspace(0, 1, canvas.width)[None, :, None]
            c1, c2 = np.array([101, 31, 255]), np.array([41, 121, 255])
            arr = (c1 * (1 - grad) + c2 * grad) * np.ones((canvas.height, 1, 1))
            canvas = Image.fromarray(arr.astype(np.uint8))
            canvas.paste(img, (b, b))
            img = canvas
    return img


def render_edit(data: bytes, params: dict, max_side: int) -> bytes:
    img = open_image(data)
    img.thumbnail((max_side, max_side), Image.LANCZOS)
    return to_jpeg(apply_edit(img, params), 85 if max_side <= 1400 else 95)


# ---------------------------------------------------------------- canvas composition (collage & carousel)
def cover_fit(img: Image.Image, bw: int, bh: int, focus_x: float = 0.5, focus_y: float = 0.5) -> Image.Image:
    bw, bh = max(1, bw), max(1, bh)
    scale = max(bw / img.width, bh / img.height)
    nw, nh = int(img.width * scale + 0.5), int(img.height * scale + 0.5)
    im = img.resize((max(nw, bw), max(nh, bh)), Image.LANCZOS)
    left = int((im.width - bw) * focus_x)
    top = int((im.height - bh) * focus_y)
    return im.crop((left, top, left + bw, top + bh))


def paste_rotated(base: Image.Image, layer: Image.Image, cx: float, cy: float, rot: float):
    if abs(rot) > 0.01:
        layer = layer.rotate(-rot, resample=Image.BICUBIC, expand=True)
    base.alpha_composite(layer, (int(cx - layer.width / 2), int(cy - layer.height / 2)))


def render_page(page: dict, W: int, H: int, images: Dict[str, bytes]) -> Image.Image:
    bg = hex_rgb(page.get("bg", "#FFFFFF"), (255, 255, 255))
    base = Image.new("RGBA", (W, H), bg + (255,))
    if page.get("bg2"):
        c2 = np.array(hex_rgb(page["bg2"]))
        grad = np.linspace(0, 1, W)[None, :, None]
        arr = (np.array(bg) * (1 - grad) + c2 * grad) * np.ones((H, 1, 1))
        base = Image.fromarray(arr.astype(np.uint8)).convert("RGBA")
    for el in page.get("elements", []):
        x, y = float(el.get("x", 0)) * W, float(el.get("y", 0)) * H
        rot = float(el.get("rot", 0))
        t = el.get("type")
        if t == "image" and el.get("photo_id") in images:
            bw, bh = int(float(el.get("w", 0.5)) * W), int(float(el.get("h", 0.5)) * H)
            border = int(float(el.get("border", 0)) * W)
            src = open_image(images[el["photo_id"]])
            inner = cover_fit(src, bw - 2 * border, bh - 2 * border)
            layer = Image.new("RGBA", (bw, bh), hex_rgb(el.get("borderColor", "#FFFFFF")) + (255,) if border else (0, 0, 0, 0))
            layer.paste(inner, (border, border))
            radius = int(float(el.get("radius", 0)) * W)
            if radius:
                mask = Image.new("L", (bw, bh), 0)
                ImageDraw.Draw(mask).rounded_rectangle((0, 0, bw - 1, bh - 1), radius=radius, fill=255)
                layer.putalpha(mask)
            paste_rotated(base, layer, x + bw / 2, y + bh / 2, rot)
        elif t in ("text", "sticker"):
            txt = str(el.get("text") or el.get("glyph") or "")[:300]
            if not txt:
                continue
            size = float(el.get("size", 0.05)) * H
            f = font_for(txt, size, "sticker" if t == "sticker" else "display")
            tmp = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
            box = tmp.multiline_textbbox((0, 0), txt, font=f, spacing=int(size * 0.2), align=el.get("align", "left"))
            tw, th = box[2] - box[0] + 8, box[3] - box[1] + 8
            layer = Image.new("RGBA", (int(tw), int(th)), (0, 0, 0, 0))
            ImageDraw.Draw(layer).multiline_text((4 - box[0], 4 - box[1]), txt, font=f, spacing=int(size * 0.2), align=el.get("align", "left"),
                                                 fill=hex_rgb(el.get("color", "#FFFFFF")) + (255,))
            if t == "sticker":
                cx, cy = x, y
            else:
                cx, cy = x + tw / 2, y + th / 2
            paste_rotated(base, layer, cx, cy, rot)
    return base.convert("RGB")


# ---------------------------------------------------------------- pose detection (MediaPipe, on server CPU)
_pose_lock = asyncio.Lock()
_landmarker = None


def get_landmarker():
    global _landmarker
    if _landmarker is None:
        from mediapipe.tasks.python import BaseOptions, vision
        opts = vision.PoseLandmarkerOptions(base_options=BaseOptions(model_asset_path=str(POSE_MODEL)), num_poses=4,
                                            min_pose_detection_confidence=0.5, min_pose_presence_confidence=0.5)
        _landmarker = vision.PoseLandmarker.create_from_options(opts)
    return _landmarker


def analyze_image(data: bytes) -> dict:
    import mediapipe as mp
    img = open_image(data)
    img.thumbnail((640, 640), Image.BILINEAR)
    arr = np.asarray(img)
    result = get_landmarker().detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(arr)))
    persons = []
    for lm in result.pose_landmarks:
        persons.append({"landmarks": [[round(p.x, 4), round(p.y, 4), round(float(p.visibility or 0), 3)] for p in lm]})
    luma = (arr[..., 0] * 0.299 + arr[..., 1] * 0.587 + arr[..., 2] * 0.114)
    h, w = luma.shape
    center = luma[h // 4: 3 * h // 4, w // 4: 3 * w // 4]
    lighting = {
        "mean": round(float(luma.mean()), 1),
        "std": round(float(luma.std()), 1),
        "p5": round(float(np.percentile(luma, 5)), 1),
        "p95": round(float(np.percentile(luma, 95)), 1),
        "clipped_highlights": round(float((luma >= 250).mean() * 100), 2),
        "crushed_shadows": round(float((luma <= 6).mean() * 100), 2),
        "center_mean": round(float(center.mean()), 1),
        "edge_mean": round(float((luma.sum() - center.sum()) / max(1, luma.size - center.size)), 1),
    }
    return {"width": img.width, "height": img.height, "persons": persons, "lighting": lighting}


# ---------------------------------------------------------------- AI helpers
LANG_NOTES = {
    "English": "Reply in clear English.",
    "Hindi": "Reply in Hindi using Devanagari script.",
    "Hinglish": "Reply in Hinglish: Hindi words written in Roman/Latin script mixed naturally with English.",
    "Bhojpuri": "Reply in Bhojpuri (Devanagari script). Use natural Bhojpuri grammar and words, not standard Hindi.",
    "Maithili": "Reply in Maithili (Devanagari script). Use natural Maithili grammar and words, not standard Hindi.",
}


def lang_note(language: str) -> str:
    return LANG_NOTES.get(language, f"Reply in {language} using its native script.")


ABYA_SYSTEM = (
    "You are ABYA, the AI photography assistant inside the PoseMate AI app. You help people take better photos: poses, "
    "camera angles, framing, lighting, editing suggestions, Instagram captions and hashtags. Be warm, concise and practical: "
    "prefer short numbered steps. Never claim you can see the user's camera unless an image is attached. Never invent facts "
    "about a photo you have not been shown. Use simple markdown-free text (no asterisks or # headings)."
)


def jpeg_b64(data: bytes, max_side: int = 1280) -> str:
    img = open_image(data)
    img.thumbnail((max_side, max_side), Image.LANCZOS)
    return base64.b64encode(to_jpeg(img, 88)).decode()


def extract_json(text: str) -> dict:
    m = re.search(r"\{.*\}", text or "", re.S)
    if not m:
        raise HTTPException(502, "AI returned an unexpected response. Please retry.")
    try:
        return json.loads(m.group(0))
    except Exception:
        raise HTTPException(502, "AI returned an unexpected response. Please retry.")


# ---------------------------------------------------------------- app
app = FastAPI()


@app.get("/health", include_in_schema=False)
@app.head("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


api = APIRouter(prefix="/api")


def need_device(x_device_id: Optional[str]) -> str:
    if not x_device_id or len(x_device_id) < 16:
        raise HTTPException(401, "Missing device id")
    return x_device_id


@api.get("/")
async def root():
    return {"app": "PoseMate AI", "status": "ok"}


# ---- photos
@api.post("/photos")
async def upload_photo(file: UploadFile = File(...), kind: str = Form("original"), x_device_id: Optional[str] = Header(None)):
    device = need_device(x_device_id)
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(413, "Photo is larger than 25 MB")
    try:
        img = await run_in_threadpool(open_image, data)
    except Exception:
        raise HTTPException(400, "Unsupported image file")
    if max(img.size) > 4096:  # keep huge photos manageable; still high resolution
        img.thumbnail((4096, 4096), Image.LANCZOS)
        data = await run_in_threadpool(to_jpeg, img, 95)
    elif (file.content_type or "") not in ("image/jpeg", "image/jpg"):
        data = await run_in_threadpool(to_jpeg, img, 95)
    return await store_photo(device, data, kind)


@api.get("/photos/{photo_id}/file")
async def photo_file(photo_id: str, d: Optional[str] = Query(None), x_device_id: Optional[str] = Header(None), w: int = Query(0)):
    device = need_device(x_device_id or d)
    photo = await get_photo(photo_id, device)
    data = await photo_bytes(photo)
    if w and 64 <= w < max(photo["width"], photo["height"]):
        img = await run_in_threadpool(open_image, data)
        img.thumbnail((w, w), Image.LANCZOS)
        data = await run_in_threadpool(to_jpeg, img, 85)
    return Response(content=data, media_type=photo.get("content_type", "image/jpeg"), headers={"Cache-Control": "private, max-age=86400"})


# ---- vision
@api.post("/vision/analyze")
async def vision_analyze(file: UploadFile = File(...), x_device_id: Optional[str] = Header(None)):
    need_device(x_device_id)
    data = await file.read()
    if len(data) > 12 * 1024 * 1024:
        raise HTTPException(413, "Frame too large")
    async with _pose_lock:
        try:
            return await run_in_threadpool(analyze_image, data)
        except Exception as exc:
            logger.exception("analyze failed")
            raise HTTPException(400, f"Could not analyse image: {exc}")


# ---- editing
class RenderReq(BaseModel):
    photo_id: str
    params: Dict[str, Any] = Field(default_factory=dict)
    preview: bool = True


@api.post("/edit/render")
async def edit_render(req: RenderReq, x_device_id: Optional[str] = Header(None)):
    device = need_device(x_device_id)
    photo = await get_photo(req.photo_id, device)
    data = await photo_bytes(photo)
    out = await run_in_threadpool(render_edit, data, req.params, 1080 if req.preview else 4096)
    if req.preview:
        return {"image": "data:image/jpeg;base64," + base64.b64encode(out).decode()}
    return await store_photo(device, out, "export", req.photo_id)


class SuggestReq(BaseModel):
    photo_id: str


@api.post("/edit/suggest")
async def edit_suggest(req: SuggestReq, x_device_id: Optional[str] = Header(None)):
    device = need_device(x_device_id)
    photo = await get_photo(req.photo_id, device)
    b64 = await run_in_threadpool(jpeg_b64, await photo_bytes(photo), 1024)
    chat = LlmChat(api_key=LLM_KEY, session_id=f"suggest-{uuid.uuid4()}", system_message="You are a professional photo retoucher.").with_model("gemini", CHAT_MODEL)
    prompt = (
        "Look at this photo and suggest edits. Return ONLY JSON: {\"adjust\": {\"exposure\": int, \"brightness\": int, \"contrast\": int, "
        "\"highlights\": int, \"shadows\": int, \"saturation\": int, \"temperature\": int, \"tint\": int, \"sharpness\": int (0-100), "
        "\"vignette\": int (0-100), \"denoise\": int (0-100)}, \"filter\": one of [none, vivid, warm, cool, film, cinematic, golden, pastel, mono, noir, vintage, fade], "
        "\"crop_aspect\": one of [original, 1:1, 4:5, 9:16], \"reasons\": [3-5 short strings explaining what you saw and why]}. "
        "Values -100..100 unless noted. Be subtle and realistic; 0 means no change."
    )
    try:
        text = await chat.send_message(UserMessage(text=prompt, file_contents=[ImageContent(b64)]))
    except Exception as exc:
        logger.exception("suggest failed")
        raise HTTPException(502, f"Smart suggestions failed: {str(exc)[:120]}")
    return extract_json(text)


class AIProcessReq(BaseModel):
    photo_id: str
    mode: str
    prompt: Optional[str] = None


AI_PROMPTS = {
    "enhance": "Professionally enhance this photograph: correct exposure and white balance, recover highlights and shadows, reduce noise, improve clarity and natural skin tones. Keep the exact same people, faces, pose, clothing, composition and framing. Do not add, remove or restyle anything.",
    "remove_bg": "Remove the entire background of this photo and place the subject(s) on a clean, plain, solid white studio background. Keep the subject(s) exactly as they are: same face, body, hair edges, clothing, pose and framing.",
    "blur_bg": "Keep the subject(s) perfectly sharp and unchanged, and apply a natural, strong shallow depth-of-field lens bokeh blur to the background only, like a portrait shot at f/1.8. Do not change the framing.",
    "replace_bg": "Replace the background of this photo with: {prompt}. Keep the subject(s) exactly the same (face, body, clothing, pose, framing) and match the lighting and colour of the new background realistically.",
}


@api.post("/ai/process")
async def ai_process(req: AIProcessReq, x_device_id: Optional[str] = Header(None)):
    device = need_device(x_device_id)
    if req.mode not in AI_PROMPTS:
        raise HTTPException(400, "Unknown mode")
    if req.mode == "replace_bg" and not (req.prompt or "").strip():
        raise HTTPException(400, "Describe the new background")
    photo = await get_photo(req.photo_id, device)
    b64 = await run_in_threadpool(jpeg_b64, await photo_bytes(photo), 1536)
    chat = LlmChat(api_key=LLM_KEY, session_id=f"img-{uuid.uuid4()}", system_message="You are an expert photo editor.")
    chat.with_model("gemini", IMAGE_MODEL).with_params(modalities=["image", "text"])
    text = AI_PROMPTS[req.mode].replace("{prompt}", (req.prompt or "").strip()[:300])
    try:
        _, images = await chat.send_message_multimodal_response(UserMessage(text=text, file_contents=[ImageContent(b64)]))
    except Exception as exc:
        logger.exception("ai process failed")
        raise HTTPException(502, f"AI processing failed: {str(exc)[:160]}")
    if not images:
        raise HTTPException(502, "The AI did not return an image. Please retry.")
    raw = base64.b64decode(images[0]["data"])
    img = await run_in_threadpool(open_image, raw)
    out = await run_in_threadpool(to_jpeg, img, 95)
    return await store_photo(device, out, "ai", req.photo_id)


# ---- compose (collage / carousel)
class ComposeReq(BaseModel):
    canvas: Dict[str, Any]


PAGE_SIZES = {"1:1": (1080, 1080), "4:5": (1080, 1350), "9:16": (1080, 1920), "3:4": (1080, 1440)}


@api.post("/compose/render")
async def compose_render(req: ComposeReq, x_device_id: Optional[str] = Header(None)):
    device = need_device(x_device_id)
    c = req.canvas
    sw, sh = PAGE_SIZES.get(c.get("aspect", "4:5"), (1080, 1350))
    mode = c.get("mode", "collage")
    slides = max(1, min(10, int(c.get("slides", 1)))) if mode == "carousel" else 1
    pages = c.get("pages") or []
    if not pages:
        raise HTTPException(400, "Nothing to export")
    ids = {el["photo_id"] for pg in pages for el in pg.get("elements", []) if el.get("type") == "image" and el.get("photo_id")}
    images = {}
    for pid in ids:
        ph = await db.photos.find_one({"id": pid, "device_id": device}, {"_id": 0})
        if ph:
            images[pid] = await photo_bytes(ph)
    outputs = []
    for page in pages[:10]:
        full = await run_in_threadpool(render_page, page, sw * slides, sh, images)
        if slides > 1:
            for i in range(slides):
                part = full.crop((i * sw, 0, (i + 1) * sw, sh))
                outputs.append(await store_photo(device, await run_in_threadpool(to_jpeg, part, 95), "export"))
        else:
            outputs.append(await store_photo(device, await run_in_threadpool(to_jpeg, full, 95), "export"))
    return {"photos": outputs}


# ---- presets
class PresetIn(BaseModel):
    name: str
    params: Dict[str, Any]


@api.get("/presets")
async def list_presets(x_device_id: Optional[str] = Header(None)):
    device = need_device(x_device_id)
    return await db.presets.find({"device_id": device}, {"_id": 0, "device_id": 0}).sort("created_at", -1).to_list(200)


@api.post("/presets")
async def create_preset(body: PresetIn, x_device_id: Optional[str] = Header(None)):
    device = need_device(x_device_id)
    doc = {"id": str(uuid.uuid4()), "device_id": device, "name": body.name.strip()[:40] or "My preset", "params": body.params, "created_at": now_iso()}
    await db.presets.insert_one(dict(doc))
    doc.pop("device_id")
    return doc


@api.delete("/presets/{preset_id}")
async def delete_preset(preset_id: str, x_device_id: Optional[str] = Header(None)):
    device = need_device(x_device_id)
    await db.presets.delete_one({"id": preset_id, "device_id": device})
    return {"ok": True}


# ---- projects
class ProjectIn(BaseModel):
    name: Optional[str] = None
    type: str = "photo"
    photos: List[str] = Field(default_factory=list)
    edits: Dict[str, Any] = Field(default_factory=dict)
    canvas: Optional[Dict[str, Any]] = None


class ProjectPatch(BaseModel):
    name: Optional[str] = None
    photos: Optional[List[str]] = None
    edits: Optional[Dict[str, Any]] = None
    canvas: Optional[Dict[str, Any]] = None
    caption: Optional[str] = None
    hashtags: Optional[str] = None
    exports: Optional[List[str]] = None
    status: Optional[str] = None
    cover: Optional[str] = None


def public_project(doc: dict) -> dict:
    doc.pop("_id", None)
    doc.pop("device_id", None)
    return doc


@api.get("/projects")
async def list_projects(x_device_id: Optional[str] = Header(None)):
    device = need_device(x_device_id)
    docs = await db.projects.find({"device_id": device}, {"_id": 0, "device_id": 0}).sort("updated_at", -1).to_list(300)
    return docs


@api.post("/projects")
async def create_project(body: ProjectIn, x_device_id: Optional[str] = Header(None)):
    device = need_device(x_device_id)
    labels = {"photo": "Photo edit", "batch": "Batch edit", "collage": "Collage", "carousel": "Carousel"}
    ts = now_iso()
    doc = {"id": str(uuid.uuid4()), "device_id": device, "name": (body.name or f"{labels.get(body.type, 'Project')} · {datetime.now(timezone.utc).strftime('%d %b %H:%M')}"),
           "type": body.type, "photos": body.photos, "edits": body.edits, "canvas": body.canvas, "caption": "", "hashtags": "",
           "exports": [], "status": "draft", "cover": body.photos[0] if body.photos else None, "created_at": ts, "updated_at": ts}
    await db.projects.insert_one(dict(doc))
    return public_project(doc)


@api.get("/projects/{project_id}")
async def get_project(project_id: str, x_device_id: Optional[str] = Header(None)):
    device = need_device(x_device_id)
    doc = await db.projects.find_one({"id": project_id, "device_id": device}, {"_id": 0, "device_id": 0})
    if not doc:
        raise HTTPException(404, "Project not found")
    return doc


@api.patch("/projects/{project_id}")
async def patch_project(project_id: str, body: ProjectPatch, x_device_id: Optional[str] = Header(None)):
    device = need_device(x_device_id)
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    upd["updated_at"] = now_iso()
    res = await db.projects.find_one_and_update({"id": project_id, "device_id": device}, {"$set": upd}, projection={"_id": 0, "device_id": 0}, return_document=True)
    if not res:
        raise HTTPException(404, "Project not found")
    return res


@api.post("/projects/{project_id}/duplicate")
async def duplicate_project(project_id: str, x_device_id: Optional[str] = Header(None)):
    device = need_device(x_device_id)
    doc = await db.projects.find_one({"id": project_id, "device_id": device}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Project not found")
    ts = now_iso()
    doc.update({"id": str(uuid.uuid4()), "name": f"{doc['name']} (copy)", "created_at": ts, "updated_at": ts, "status": "draft"})
    await db.projects.insert_one(dict(doc))
    return public_project(doc)


@api.delete("/projects/{project_id}")
async def delete_project(project_id: str, purge: bool = Query(False), x_device_id: Optional[str] = Header(None)):
    device = need_device(x_device_id)
    doc = await db.projects.find_one({"id": project_id, "device_id": device}, {"_id": 0})
    if not doc:
        return {"ok": True, "photos_deleted": 0}
    await db.projects.delete_one({"id": project_id, "device_id": device})
    deleted = 0
    if purge:
        ids = set(doc.get("photos") or []) | set(doc.get("exports") or []) | set((doc.get("edits") or {}).keys())
        for pg in ((doc.get("canvas") or {}).get("pages") or []):
            ids |= {e.get("photo_id") for e in pg.get("elements", []) if e.get("photo_id")}
        # include AI results derived from these photos (e.g. undone background swaps)
        derived = await db.photos.find({"device_id": device, "source_id": {"$in": list(ids)}}, {"_id": 0, "id": 1}).to_list(1000)
        ids |= {d["id"] for d in derived}
        ids.discard(None)
        # keep anything still used by another project or an ABYA conversation
        keep = set()
        async for p in db.projects.find({"device_id": device}, {"_id": 0, "photos": 1, "exports": 1, "edits": 1, "canvas": 1}):
            keep |= set(p.get("photos") or []) | set(p.get("exports") or []) | set((p.get("edits") or {}).keys())
            for pg in ((p.get("canvas") or {}).get("pages") or []):
                keep |= {e.get("photo_id") for e in pg.get("elements", []) if e.get("photo_id")}
        keep |= {m["photo_id"] async for m in db.abya_messages.find({"photo_id": {"$in": list(ids)}}, {"photo_id": 1})}
        gone = list(ids - keep)
        if gone:
            res = await db.photos.delete_many({"device_id": device, "id": {"$in": gone}})
            deleted = res.deleted_count
            for pid in gone:
                _bytes_cache.pop(pid, None)
    return {"ok": True, "photos_deleted": deleted}


@api.delete("/photos/{photo_id}")
async def delete_photo(photo_id: str, x_device_id: Optional[str] = Header(None)):
    device = need_device(x_device_id)
    res = await db.photos.delete_one({"id": photo_id, "device_id": device})
    _bytes_cache.pop(photo_id, None)
    return {"ok": True, "deleted": res.deleted_count}


# ---- ABYA assistant
class ChatReq(BaseModel):
    session_id: Optional[str] = None
    message: str
    language: str = "English"
    photo_id: Optional[str] = None


@api.get("/abya/sessions")
async def abya_sessions(x_device_id: Optional[str] = Header(None)):
    device = need_device(x_device_id)
    return await db.abya_sessions.find({"device_id": device}, {"_id": 0, "device_id": 0}).sort("updated_at", -1).to_list(100)


@api.get("/abya/sessions/{session_id}/messages")
async def abya_messages(session_id: str, x_device_id: Optional[str] = Header(None)):
    device = need_device(x_device_id)
    if not await db.abya_sessions.find_one({"id": session_id, "device_id": device}):
        raise HTTPException(404, "Conversation not found")
    return await db.abya_messages.find({"session_id": session_id}, {"_id": 0}).sort("created_at", 1).to_list(500)


@api.delete("/abya/sessions/{session_id}")
async def abya_delete(session_id: str, x_device_id: Optional[str] = Header(None)):
    device = need_device(x_device_id)
    res = await db.abya_sessions.delete_one({"id": session_id, "device_id": device})
    if res.deleted_count:
        await db.abya_messages.delete_many({"session_id": session_id})
    return {"ok": True}


@api.post("/abya/chat")
async def abya_chat(req: ChatReq, x_device_id: Optional[str] = Header(None)):
    device = need_device(x_device_id)
    text = req.message.strip()[:4000]
    if not text:
        raise HTTPException(400, "Empty message")
    sid = req.session_id
    if sid:
        if not await db.abya_sessions.find_one({"id": sid, "device_id": device}):
            raise HTTPException(404, "Conversation not found")
    else:
        sid = str(uuid.uuid4())
        await db.abya_sessions.insert_one({"id": sid, "device_id": device, "title": text[:60], "language": req.language, "created_at": now_iso(), "updated_at": now_iso()})
    history = await db.abya_messages.find({"session_id": sid}, {"_id": 0}).sort("created_at", -1).to_list(16)
    history.reverse()
    files = []
    if req.photo_id:
        photo = await get_photo(req.photo_id, device)
        files.append(ImageContent(await run_in_threadpool(jpeg_b64, await photo_bytes(photo), 1024)))
    await db.abya_messages.insert_one({"id": str(uuid.uuid4()), "session_id": sid, "role": "user", "text": text, "photo_id": req.photo_id, "created_at": now_iso()})

    transcript = "\n".join(f"{'User' if m['role'] == 'user' else 'ABYA'}: {m['text']}" for m in history)
    prompt = (f"Conversation so far:\n{transcript}\n\n" if transcript else "") + f"User: {text}\n\nLanguage instruction: {lang_note(req.language)}"
    chat = LlmChat(api_key=LLM_KEY, session_id=f"abya-{sid}-{uuid.uuid4()}", system_message=ABYA_SYSTEM).with_model("gemini", CHAT_MODEL)

    async def gen():
        yield f"data: {json.dumps({'session_id': sid})}\n\n"
        full = []
        try:
            async for ev in chat.stream_message(UserMessage(text=prompt, file_contents=files or None)):
                if isinstance(ev, TextDelta):
                    full.append(ev.content)
                    yield f"data: {json.dumps({'delta': ev.content})}\n\n"
                elif isinstance(ev, StreamDone):
                    break
        except Exception as exc:
            logger.exception("abya stream failed")
            yield f"data: {json.dumps({'error': 'ABYA could not answer right now. Please retry.'})}\n\n"
            return
        answer = "".join(full).strip()
        mid = str(uuid.uuid4())
        await db.abya_messages.insert_one({"id": mid, "session_id": sid, "role": "assistant", "text": answer, "created_at": now_iso()})
        await db.abya_sessions.update_one({"id": sid}, {"$set": {"updated_at": now_iso(), "language": req.language}})
        yield f"data: {json.dumps({'done': True, 'message_id': mid})}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


STT_LANG = {"English": "en", "Hindi": "hi", "Bhojpuri": "hi", "Maithili": "hi", "Bengali": "bn", "Marathi": "mr", "Tamil": "ta",
            "Telugu": "te", "Gujarati": "gu", "Punjabi": "pa", "Kannada": "kn", "Malayalam": "ml", "Urdu": "ur"}


@api.post("/abya/stt")
async def abya_stt(audio: UploadFile = File(...), language: str = Form("English"), x_device_id: Optional[str] = Header(None)):
    need_device(x_device_id)
    data = await audio.read()
    if len(data) < 2000:
        return {"text": ""}
    suffix = Path(audio.filename or "rec.m4a").suffix or ".m4a"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(data)
        path = tmp.name
    try:
        stt = OpenAISpeechToText(api_key=LLM_KEY)
        kwargs = {"model": "gpt-4o-mini-transcribe", "response_format": "json"}
        if STT_LANG.get(language):
            kwargs["language"] = STT_LANG[language]
        if language == "Hinglish":
            kwargs["prompt"] = "Hinglish: Hindi mixed with English, write in Roman script."
        with open(path, "rb") as f:
            resp = await stt.transcribe(file=f, **kwargs)
        return {"text": (resp.text or "").strip()}
    except Exception as exc:
        logger.exception("stt failed")
        raise HTTPException(502, f"Transcription failed: {str(exc)[:120]}")
    finally:
        with suppress(Exception):
            os.unlink(path)


class TTSReq(BaseModel):
    text: str


_tts_cache: "OrderedDict[str, bytes]" = OrderedDict()


@api.post("/abya/tts")
async def abya_tts(req: TTSReq, x_device_id: Optional[str] = Header(None)):
    need_device(x_device_id)
    text = re.sub(r"[*#_`>]", "", req.text).strip()[:1500]
    if not text:
        raise HTTPException(400, "Nothing to speak")
    try:
        audio = await OpenAITextToSpeech(api_key=LLM_KEY).generate_speech(text=text, model="tts-1", voice="nova")
    except Exception as exc:
        logger.exception("tts failed")
        raise HTTPException(502, f"Voice reply failed: {str(exc)[:120]}")
    aid = str(uuid.uuid4())
    _tts_cache[aid] = audio
    while len(_tts_cache) > 40:
        _tts_cache.popitem(last=False)
    return {"url": f"/api/abya/audio/{aid}.mp3"}


@api.get("/abya/audio/{audio_id}.mp3")
async def abya_audio(audio_id: str):
    if audio_id not in _tts_cache:
        raise HTTPException(404, "Audio expired")
    return Response(content=_tts_cache[audio_id], media_type="audio/mpeg")


# ---- AI content assistant
class ContentReq(BaseModel):
    photo_id: Optional[str] = None
    context: str = ""
    language: str = "English"
    tone: str = "aesthetic"


@api.post("/content/generate")
async def content_generate(req: ContentReq, x_device_id: Optional[str] = Header(None)):
    device = need_device(x_device_id)
    files = []
    if req.photo_id:
        photo = await get_photo(req.photo_id, device)
        files.append(ImageContent(await run_in_threadpool(jpeg_b64, await photo_bytes(photo), 1024)))
    if not files and not req.context.strip():
        raise HTTPException(400, "Add a photo or describe it first")
    prompt = (
        f"Create Instagram content for {'this photo' if files else 'a photo described as: ' + req.context}. "
        f"{('Extra context from the user: ' + req.context) if files and req.context else ''} Tone: {req.tone}. "
        f"Language: {lang_note(req.language)} Hashtags may mix English and the chosen language. "
        "Return ONLY JSON: {\"captions\": [4 distinct caption options, each 1-2 lines, may include 1-2 emojis], "
        "\"hashtags\": [15-20 relevant hashtags each starting with #], \"story_text\": \"short punchy story overlay text\", "
        "\"description\": \"1-2 sentence accessible description of what is in the photo\"}."
    )
    chat = LlmChat(api_key=LLM_KEY, session_id=f"content-{uuid.uuid4()}", system_message="You are a social media copywriter for photographers.").with_model("gemini", CHAT_MODEL)
    try:
        text = await chat.send_message(UserMessage(text=prompt, file_contents=files or None))
    except Exception as exc:
        logger.exception("content failed")
        raise HTTPException(502, f"Caption generation failed: {str(exc)[:120]}")
    data = extract_json(text)
    return {"captions": data.get("captions", [])[:6], "hashtags": data.get("hashtags", [])[:30],
            "story_text": data.get("story_text", ""), "description": data.get("description", "")}


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
async def startup():
    app.state.index_task = asyncio.create_task(ensure_indexes())
    try:
        await run_in_threadpool(init_storage)
    except Exception as exc:
        logger.error("storage init failed: %s", exc)


@app.on_event("shutdown")
async def shutdown():
    app.state.index_task.cancel()
    with suppress(asyncio.CancelledError):
        await app.state.index_task
    client.close()
