# AI Virtual Travel Check-in

AI virtual travel photo check-in system for selecting travel scenes, uploading or capturing a portrait, and generating a composited souvenir image through ComfyUI.

## Project Structure

- `app/` - FastAPI backend and ComfyUI integration.
- `web/` - Frontend pages and static assets.
- `storage/uploads/` - Background templates used by the app.

## Runtime Notes

The backend expects a running ComfyUI service and reads settings from environment variables with the `AIBACKGROUND_` prefix.

Important defaults:

- App port: `8010`
- ComfyUI base URL: `http://127.0.0.1:8190`
- Template directory: `storage/uploads`

Runtime files such as logs, generated results, certificates, temporary upload sessions, and local virtual environments are intentionally ignored by Git.
