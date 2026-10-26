from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    gemeente: str = os.environ.get("MIJNSTRAAT_GEMEENTE", "Lingewaard")
    days: int = int(os.environ.get("MIJNSTRAAT_DAYS", "90"))
    ollama_url: str = os.environ.get("OLLAMA_URL", "http://localhost:11434")
    model: str = os.environ.get("MIJNSTRAAT_MODEL", "qwen3:30b-a3b")
    out_dir: str = os.environ.get("MIJNSTRAAT_OUT", "../data/public")
    cache_dir: str = os.environ.get("MIJNSTRAAT_CACHE", "../data/cache")
    user_agent: str = "MijnStraat-POC/0.1 (Jumpstart Media)"
