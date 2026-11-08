# PoseMate AI — Powered by ABYA (PRD)

## Original problem statement
Premium Android photography studio: smart AI camera with live pose/lighting/composition guidance, ML pose detection + explainable Pose Match, pose library, ABYA multilingual (Hindi/English/Hinglish/Bhojpuri/Maithili/regional) Gemini assistant with voice, pro photo editor, AI enhancement & background tools, presets + batch editing, SCRL-inspired creative canvas (collage, multi-page, seamless carousel), caption/hashtag generation, direct sharing, private projects. No social features, no fake functionality.

## Choices (user skipped questions → defaults)
Gemini 3.1 Pro (Emergent LLM key) · OpenAI gpt-4o-mini-transcribe + tts-1 for voice · Gemini Nano Banana (gemini-3.1-flash-image-preview) for enhance / remove / blur / replace background · Emergent Object Storage for photos · No login (private random device id).

## Architecture
- Expo SDK 58 (expo-router, 5 tabs: Home, Camera, Pose AI, ABYA, Projects) + stacks: /pose/[id], /editor/[id], /studio/[id], /share/[id]
- FastAPI (server.py): photos (object storage), /vision/analyze (MediaPipe Pose Landmarker lite, up to 4 people + luminance stats), /edit/render (Pillow non-destructive params), /edit/suggest, /ai/process, /compose/render (collage pages / carousel panorama sliced into slides), presets, projects, ABYA SSE chat + sessions, STT, TTS, /content/generate
- Pose Match: client-side segment-angle comparison (src/pose/match.ts), mirror-aware, per-segment degrees + suggestions
- Pose library: 25 bone-angle-defined reference figures (offline, bundled)

## Implemented (2026-06)
- Camera: front/rear, flash, zoom, tap-to-refocus, timer, grid, horizon level (accelerometer), 3:4/1:1/9:16, gallery, ghost pose overlay, live skeleton (~1 fps via server), lighting/framing/body tips, match score, post-capture AI feedback, save/edit
- Editor: 12 adjustments, 12 filters, presets (5 groups + custom), batch apply, crop/aspect/zoom/straighten/rotate/flip, text (Devanagari), stickers, frames, undo/redo, hold-to-compare, autosave, AI tools
- Studio: templates (collage + carousel), drag with snap guides, size/rotate/border/corners, layers, pages, slide count, backgrounds, carousel preview, export
- Share: preview, ABYA captions/hashtags/story text/alt text in 14 languages, editable, copy, share sheet targets, save to gallery
- Projects: list, rename, duplicate, delete, recover drafts
- Tested: iteration_1 backend 22/22, frontend flows pass

## Known limitations / backlog
- P0: Exposure compensation & exposure lock not supported by expo-camera → not implemented (post-capture exposure in editor)
- P1: Real-time on-device ML Kit pose (needs native module/dev build via react-native-vision-camera); current live guide ~1 fps over network
- P1: App-specific share buttons open Android Sharesheet (user picks the app); IG Stories direct intent requires Meta App ID
- P2: Photo deletion endpoint/cleanup; TTS audio cache is in-memory; split server.py into modules
