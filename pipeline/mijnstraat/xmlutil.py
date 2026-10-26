from __future__ import annotations

import html
import re
from html.parser import HTMLParser
from xml.etree import ElementTree as ET


def local(tag: str) -> str:
    """Tag zonder namespace: '{ns}title' -> 'title'."""
    return tag.rsplit("}", 1)[-1]


def find_all(elem: ET.Element, name: str) -> list[ET.Element]:
    return [e for e in elem.iter() if local(e.tag) == name]


def first_text(elem: ET.Element, *names: str) -> str:
    for name in names:
        for e in find_all(elem, name):
            if e.text and e.text.strip():
                return e.text.strip()
    return ""


class _TextExtractor(HTMLParser):
    SKIP = {"script", "style", "head", "nav", "header", "footer"}

    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self._skip += 1
        elif tag in {"p", "br", "li", "div", "h1", "h2", "h3", "tr"}:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in self.SKIP and self._skip:
            self._skip -= 1

    def handle_data(self, data):
        if not self._skip:
            self.parts.append(data)


def html_to_text(markup: str) -> str:
    parser = _TextExtractor()
    parser.feed(markup)
    text = html.unescape("".join(parser.parts))
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text)
    return text.strip()
