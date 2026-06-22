"""Stretchy Studio AI Animation backend.

Run with:
    uvicorn backend.main:app --reload --port 8000
"""
from __future__ import annotations

import os
from dotenv import load_dotenv

load_dotenv()
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models.animation_models import (
    AnimationPlan,
    GenerateAnimationRequest,
    GenerateAnimationResponse,
)
from services.animation_service import AnimationServiceError, generate_animation_plan

app = FastAPI(title="Stretchy Studio AI Animation API", version="0.1.0")

_allowed_origins = os.environ.get("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/supported-actions")
async def supported_actions():
    from models.animation_models import SUPPORTED_ACTIONS

    return {"actions": list(SUPPORTED_ACTIONS)}


@app.post("/api/generate-animation", response_model=GenerateAnimationResponse)
async def generate_animation(req: GenerateAnimationRequest) -> AnimationPlan:
    try:
        plan = await generate_animation_plan(req.prompt, model=req.model)
    except AnimationServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return plan
