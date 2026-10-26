"""Samenvatten in gewone taal met een lokaal model via Ollama."""
from __future__ import annotations

import json
import re

import httpx

from .categorize import CATEGORIES

SYSTEM = (
    "Je vat officiële bekendmakingen van een Nederlandse gemeente samen voor bewoners. "
    "Schrijf in gewone taal (B1), maximaal drie korte zinnen. Noem wat er gebeurt, waar, "
    "en wat een bewoner kan doen (reageren, bezwaar maken) met de termijn als die in de tekst staat. "
    "Verzin niets: staat iets niet in de tekst, laat het dan weg."
)

PROMPT = """Titel: {title}

Tekst:
{text}

Antwoord alleen met JSON in deze vorm:
{{"samenvatting": "...", "categorie": "een van: {cats}", "locatie": "adres of straatnaam uit de tekst, of leeg"}}"""


def _strip_thinking(content: str) -> str:
    return re.sub(r"<think>.*?</think>", "", content, flags=re.S).strip()


def parse_answer(content: str) -> dict:
    content = _strip_thinking(content)
    m = re.search(r"\{.*\}", content, flags=re.S)
    if not m:
        raise ValueError(f"Geen JSON in antwoord: {content[:200]!r}")
    data = json.loads(m.group(0))
    category = str(data.get("categorie", "")).strip().lower()
    return {
        "summary": str(data.get("samenvatting", "")).strip(),
        "category": category if category in CATEGORIES else "",
        "location": str(data.get("locatie", "")).strip(),
    }


class Summarizer:
    def __init__(self, client: httpx.Client, base_url: str, model: str) -> None:
        self.client = client
        self.base_url = base_url.rstrip("/")
        self.model = model

    def summarize(self, title: str, text: str, max_chars: int = 24_000) -> dict:
        body = {
            "model": self.model,
            "stream": False,
            "format": "json",
            "options": {"temperature": 0.2, "num_ctx": 16384},
            "messages": [
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": PROMPT.format(title=title, text=text[:max_chars], cats=", ".join(CATEGORIES))},
            ],
        }
        if self.model.startswith("qwen3"):
            body["think"] = False
        resp = self.client.post(f"{self.base_url}/api/chat", json=body, timeout=600)
        resp.raise_for_status()
        return parse_answer(resp.json()["message"]["content"])
