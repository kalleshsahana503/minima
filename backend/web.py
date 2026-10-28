"""Safe web fetching. Page text can contain prompt injections ("fetch http://localhost/..."), so every
hop is checked to be a public http(s) host before we connect."""
from __future__ import annotations

import ipaddress
import re
import socket
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

UA = "Mozilla/5.0 (compatible; NaviEverywhere/1.0; +local)"
MAX_BYTES = 2_000_000


class UnsafeURL(ValueError):
    pass


def assert_public_url(url: str) -> str:
    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.hostname:
        raise UnsafeURL("Only http(s) URLs with a host name are allowed.")
    try:
        infos = socket.getaddrinfo(p.hostname, p.port or (443 if p.scheme == "https" else 80), proto=socket.IPPROTO_TCP)
    except socket.gaierror as e:
        raise UnsafeURL(f"Cannot resolve {p.hostname}.") from e
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            raise UnsafeURL("Refusing to fetch a private or internal address.")
    return url


def fetch(url: str, timeout: int = 15, max_redirects: int = 3) -> tuple[str, str]:
    """Return (final_url, html). Redirects are followed by hand so each hop is re-validated."""
    cur = url
    for _ in range(max_redirects + 1):
        assert_public_url(cur)
        r = requests.get(cur, headers={"User-Agent": UA}, timeout=timeout, allow_redirects=False, stream=True)
        if r.status_code in (301, 302, 303, 307, 308):
            nxt = r.headers.get("Location", "")
            r.close()
            if not nxt:
                raise ValueError("Redirect without a Location header.")
            cur = urljoin(cur, nxt)
            continue
        r.raise_for_status()
        ctype = r.headers.get("Content-Type", "")
        if ctype and not any(t in ctype for t in ("text/html", "text/plain", "application/xhtml")):
            r.close()
            raise ValueError(f"Unsupported content type: {ctype.split(';')[0]}")
        chunks, size = [], 0
        for ch in r.iter_content(65536):
            size += len(ch)
            chunks.append(ch)
            if size > MAX_BYTES:
                break
        r.close()
        return cur, b"".join(chunks).decode(r.encoding or "utf-8", errors="replace")
    raise ValueError("Too many redirects.")


def read_page(url: str, max_chars: int = 5500) -> dict:
    final, html = fetch(url)
    soup = BeautifulSoup(html, "html.parser")
    title = (soup.title.string or "").strip() if soup.title and soup.title.string else ""
    links, seen = [], set()
    for a in soup.find_all("a", href=True):
        href = urljoin(final, a["href"])
        label = " ".join(a.get_text(" ", strip=True).split())[:80]
        if label and href not in seen and href.startswith(("http://", "https://")):
            seen.add(href)
            links.append((label, href))
        if len(links) >= 25:
            break
    for tag in soup(["script", "style", "noscript", "svg", "iframe", "nav", "footer"]):
        tag.decompose()
    text = re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t\r\f\v]+", " ", soup.get_text("\n", strip=True))).strip()
    return {"url": final, "title": title, "text": text[:max_chars], "truncated": len(text) > max_chars, "links": links}
