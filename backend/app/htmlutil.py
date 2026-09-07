from __future__ import annotations

from urllib.parse import urljoin

import bleach
from bleach.css_sanitizer import CSSSanitizer

ALLOWED_TAGS = [
    "p", "br", "pre", "code", "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td",
    "img", "a", "strong", "b", "em", "i", "span", "div", "sub", "sup",
    "blockquote", "hr", "section", "article", "figure", "figcaption",
    "u", "s", "center", "font", "caption",
]
ALLOWED_ATTR = {
    "*": ["class", "id", "title", "style"],
    "a": ["href", "target", "rel"],
    "img": ["src", "alt", "width", "height"],
    "td": ["colspan", "rowspan", "align"],
    "th": ["colspan", "rowspan", "align"],
    "table": ["border", "cellpadding", "cellspacing", "width"],
    "font": ["size", "color"],
}

_css = CSSSanitizer(allowed_css_properties=["color", "background-color", "font-weight", "text-align", "width", "height"])


def sanitize(html: str, base_url: str = "") -> str:
    cleaned = bleach.clean(
        html or "",
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTR,
        css_sanitizer=_css,
        strip=True,
    )
    if not base_url:
        return cleaned
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(cleaned, "lxml")
    for tag in soup.find_all(["img", "a", "source"]):
        attr = "href" if tag.name == "a" else "src"
        val = tag.get(attr)
        if val and not val.startswith(("http://", "https://", "data:", "mailto:")):
            tag[attr] = urljoin(base_url, val)
    for a in soup.find_all("a"):
        a["target"] = "_blank"
        a["rel"] = "noopener noreferrer"
    return str(soup)


def text_or_html(el) -> str:
    if el is None:
        return ""
    return str(el)
