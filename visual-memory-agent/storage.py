import os
import hashlib
import base64
import binascii
import re
from pathlib import Path
from fastapi import HTTPException
import httpx

STORAGE_DIR = os.getenv("IMAGE_STORAGE_DIR", "./image_storage")
os.makedirs(STORAGE_DIR, exist_ok=True)
INLINE_IMAGE_URL_PATTERN = re.compile(r"^(?:data:)?(image/[\w.+-]+);base64,(.+)$", re.IGNORECASE | re.DOTALL)

def _decode_inline_image_url(image_url: str) -> bytes | None:
    match = INLINE_IMAGE_URL_PATTERN.match(image_url.strip())
    if not match:
        return None
    raw_b64 = " ".join(match.group(2).split())
    try:
        return base64.b64decode(raw_b64, validate=True)
    except binascii.Error:
        try:
            padded = raw_b64 + "=" * (-len(raw_b64) % 4)
            return base64.urlsafe_b64decode(padded)
        except binascii.Error:
            raise HTTPException(status_code=400, detail="Invalid base64 image URL payload")

def _decode_image_to_bytes(
    image_base64: str | None,
    image_url: str | None,
    image_uri: str | None = None,
) -> bytes:
    """Decode image from base64 or fetch from URL and return raw bytes."""
    if image_uri:
        path = _resolve_image_uri_path(image_uri)
        if not path.exists():
            raise HTTPException(status_code=404, detail=f"Stored image not found: {image_uri}")
        with open(path, "rb") as file:
            return file.read()

    if image_base64:
        raw = image_base64
        if "," in raw:
            raw = raw.split(",", 1)[1]
        try:
            return base64.b64decode(raw)
        except binascii.Error:
            try:
                padded = raw + "=" * (-len(raw) % 4)
                return base64.urlsafe_b64decode(padded)
            except binascii.Error:
                raise HTTPException(status_code=400, detail="Invalid base64 image data")
    
    if image_url:
        inline_image = _decode_inline_image_url(image_url)
        if inline_image is not None:
            return inline_image
        try:
            with httpx.Client(timeout=30, follow_redirects=True) as client:
                resp = client.get(
                    image_url,
                    headers={
                        "User-Agent": (
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                            "AppleWebKit/537.36 (KHTML, like Gecko) "
                            "Chrome/124.0.0.0 Safari/537.36"
                        ),
                        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
                        "Accept-Language": "en-US,en;q=0.9",
                        "Cache-Control": "no-cache",
                    },
                )
                resp.raise_for_status()
                return resp.content
        except httpx.HTTPError as e:
            raise HTTPException(status_code=400, detail=f"Failed to fetch image URL: {e}")
    
    raise HTTPException(status_code=400, detail="No image data provided")

def compute_hash(image_bytes: bytes) -> str:
    """Compute SHA-256 hash of image bytes."""
    return hashlib.sha256(image_bytes).hexdigest()

def save_image(image_bytes: bytes, reference_id: str, version: str) -> str:
    """Save image bytes to file storage and return relative URI."""
    ext = _detect_extension(image_bytes)
    # ✅ FIX: Added underscore between reference_id and version
    filename = f"{reference_id}_{version}{ext}"
    file_path = Path(STORAGE_DIR) / filename
    with open(file_path, "wb") as f:
        f.write(image_bytes)
    return f"image_storage/{filename}"

def _resolve_image_uri_path(image_uri: str) -> Path:
    cleaned_uri = (image_uri or "").strip()
    if not cleaned_uri:
        raise ValueError("image_uri is required")
    candidate_path = Path(cleaned_uri)
    if candidate_path.is_absolute():
        return candidate_path
    normalized_uri = cleaned_uri.replace("\\", "/").lstrip("/")
    if normalized_uri.startswith("image_storage/"):
        normalized_uri = normalized_uri[len("image_storage/"):]
    return Path(STORAGE_DIR) / normalized_uri

def delete_image(image_uri: str) -> bool:
    file_path = _resolve_image_uri_path(image_uri)
    if not file_path.exists():
        return False
    file_path.unlink()
    return True

def load_image(image_uri: str) -> bytes:
    file_path = _resolve_image_uri_path(image_uri)
    if not file_path.exists():
        raise FileNotFoundError(f"Image not found: {image_uri}")
    with open(file_path, "rb") as file:
        return file.read()

def _detect_extension(image_bytes: bytes) -> str:
    """Detect file extension from image magic bytes."""
    if image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if image_bytes.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if image_bytes.startswith(b"GIF87a") or image_bytes.startswith(b"GIF89a"):
        return ".gif"
    if image_bytes.startswith(b"RIFF") and image_bytes[8:12] == b"WEBP":
        return ".webp"
    return ".jpg"

def image_exists(image_uri: str) -> bool:
    """Check if an image file actually exists on disk."""
    if not image_uri:
        return False
    try:
        path = _resolve_image_uri_path(image_uri)
        return path.exists()
    except Exception:
        return False
