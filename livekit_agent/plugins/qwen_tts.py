"""
plugins/qwen_tts.py — TTS plugin wrapping a generic Qwen TTS endpoint.
"""
import os
import io
import aiohttp
import soundfile as sf
import numpy as np
from livekit.agents import tts


TTS_URL = os.environ.get("TTS_URL", "http://tts-server:8080/v1/audio/speech")
SAMPLE_RATE = 22050


class QwenTts(tts.TTS):
    """Thin wrapper around Qwen TTS endpoint."""

    def __init__(self, voice: str = "default"):
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=False),
            sample_rate=SAMPLE_RATE,
            num_channels=1,
        )
        self._voice = voice

    def synthesize(self, text: str) -> "QwenSynthesizeStream":
        return QwenSynthesizeStream(text=text, voice=self._voice)


class QwenSynthesizeStream(tts.SynthesizeStream):
    def __init__(self, *, text: str, voice: str):
        super().__init__()
        self._text = text
        self._voice = voice

    async def _main_task(self) -> None:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                TTS_URL,
                json={
                    "input": self._text,
                    "voice": self._voice,
                    "model": "qwen3-tts"
                },
                headers={
                    "Content-Type": "application/json",
                },
            ) as resp:
                resp.raise_for_status()
                audio_bytes = await resp.read()

        # Decode audio (WAV or MP3 from TTS server)
        audio_data, sample_rate = sf.read(io.BytesIO(audio_bytes), dtype="float32")

        # Ensure mono
        if audio_data.ndim > 1:
            audio_data = audio_data.mean(axis=1)

        # Convert to int16 PCM for LiveKit
        pcm = (audio_data * 32767).astype(np.int16)

        self._event_ch.send_nowait(
            tts.SynthesizedAudio(
                text=self._text,
                data=rtc_audio_frame(pcm, sample_rate),
            )
        )


def rtc_audio_frame(pcm: np.ndarray, sample_rate: int):
    """Wrap PCM numpy array as LiveKit AudioFrame."""
    from livekit import rtc
    return rtc.AudioFrame(
        data=pcm.tobytes(),
        sample_rate=sample_rate,
        num_channels=1,
        samples_per_channel=len(pcm),
    )
