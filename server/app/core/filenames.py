import re
from urllib.parse import quote

# Anything that could break out of a quoted string or header line, or inject
# a second header, is stripped from filenames we echo back to the browser.
_UNSAFE_FILENAME_CHARS = re.compile(r'[\r\n"\x00-\x1f]')
_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")


def sanitize_filename(filename: str, fallback: str = "download") -> str:
    """Strip CR/LF/quotes/control characters from a client-supplied filename.

    Prevents header-injection and filename=" quoting anomalies in
    ``Content-Disposition`` for names like ``evil\r\nX-Injected: 1`` or
    ``a"b"c.txt``.
    """
    cleaned = _UNSAFE_FILENAME_CHARS.sub("", filename or "").strip()
    if not cleaned or cleaned in {".", ".."}:
        return fallback
    return cleaned


def build_content_disposition(filename: str, *, disposition: str = "inline") -> str:
    """Build a safe Content-Disposition value.

    Uses RFC 5987 encoding for non-ASCII names so Unicode survives intact,
    and never allows the name to break out of the header.
    """
    safe = sanitize_filename(filename)
    ascii_part = quote(safe)
    return f'{disposition}; filename="{safe}"; filename*=UTF-8\'\'{ascii_part}'


def sanitize_storage_basename(filename: str, fallback: str = "file") -> str:
    """Return a filesystem-safe basename (no path separators, no controls)."""
    name = _CONTROL_CHARS.sub("", filename or "").strip().replace("\\", "/").split("/")[-1]
    return name if name and name not in {".", ".."} else fallback