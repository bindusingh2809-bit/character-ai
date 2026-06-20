from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import storage
from app.config import settings
from app.routers import characters

app = FastAPI(title="Rig Platform API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    # In Codespaces (or any forwarded-port dev environment) the browser
    # talks to *.app.github.dev, not localhost. The Vite dev proxy means
    # the frontend never needs to call this directly in normal use, but
    # this regex covers it (e.g. hitting /docs from the forwarded 8000
    # port, or calling the API straight from the browser).
    allow_origin_regex=settings.cors_allow_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded images / character folders directly, e.g.
# /media/characters/<id>/original.png
app.mount(
    "/media/characters",
    StaticFiles(directory=str(storage.CHARACTERS_DIR)),
    name="media-characters",
)

app.include_router(characters.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
