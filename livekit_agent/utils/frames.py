"""
utils/frames.py — Hybrid frame sampling for the LiveKit agent.

Strategy: combine evenly-spread frames (temporal coverage)
+ last N frames (most recent context), deduplicated.
"""


def pick_frames(buffer: list, n_recent: int = 4, n_spread: int = 2) -> list:
    """
    Return up to (n_recent + n_spread) unique frames from buffer.

    Args:
        buffer:   Rolling list of base64-encoded JPEG strings.
        n_recent: Take the last N frames unconditionally.
        n_spread: Take N frames evenly spread across the full buffer
                  for temporal context.

    Returns:
        Ordered list of base64 JPEG strings, oldest-first, max 6 items.
    """
    if not buffer:
        return []

    # Evenly spread across full buffer
    spread_indices: list[int] = []
    if len(buffer) >= 2 and n_spread >= 2:
        spread_indices = [
            int(i * (len(buffer) - 1) / (n_spread - 1))
            for i in range(n_spread)
        ]
    elif buffer:
        spread_indices = [0]

    spread = [buffer[i] for i in spread_indices]

    # Last N frames
    recent = buffer[-n_recent:]

    # Merge, deduplicate by object identity, preserve order
    seen: set[int] = set()
    result: list[str] = []
    for frame in spread + recent:
        fid = id(frame)
        if fid not in seen:
            seen.add(fid)
            result.append(frame)

    return result  # ≤ 6 frames
