"""
plugins/whisper_stt.py — STT plugin wrapping a generic Whisper API endpoint.
"""
import os
import io
import aiohttp
from livekit.agents import stt


STT_URL = os.environ.get("STT_URL", "http://wlk-gpu-sortformer:8000/v1/audio/transcriptions")


class WhisperSTT(stt.STT):
    """Thin wrapper around an OpenAI-compatible Whisper STT endpoint."""

    def __init__(self):
        super().__init__(capabilities=stt.STTCapabilities(streaming=False, interim_results=False))

    async def _recognize_impl(
        self,
        buffer: "stt.AudioBuffer",
        **kwargs,
    ) -> stt.SpeechEvent:
        language = kwargs.get("language")
        audio_bytes = buffer.to_wav_bytes()

        form = aiohttp.FormData()
        form.add_field(
            "file",
            audio_bytes,
            filename="audio.wav",
            content_type="audio/wav",
        )
        form.add_field("model", "whisper-1")

        async with aiohttp.ClientSession() as session:
            async with session.post(
                STT_URL,
                data=form,
            ) as resp:
                resp.raise_for_status()
                data = await resp.json()

        text = data.get("text", "").strip()
        return stt.SpeechEvent(
            type=stt.SpeechEventType.FINAL_TRANSCRIPT,
            alternatives=[stt.SpeechData(text=text, language=language or "en")],
        )

    # Required abstract stub — we use recognize() not stream()
    def stream(self, *, language=None):
        raise NotImplementedError("WhisperSTT is non-streaming")
