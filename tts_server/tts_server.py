import threading
import subprocess
import os
import io
import uuid
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from RealtimeTTS import TextToAudioStream, FasterQwenEngine, FasterQwenVoice

app = FastAPI(title="Faster Qwen TTS Server (OpenAI Compatible)")
import re

def strip_think_blocks(text: str) -> str:
    if not text:
        return text
    # Remove completed think blocks
    text = re.sub(r'<think>[\s\S]*?</think>', '', text)
    # Remove unclosed think blocks
    if '<think>' in text:
        text = text.split('<think>')[0]
    return text.strip()



# Load dynamically from /app/voices
voices_dir = "/app/voices"
loaded_voices = {}

if os.path.exists(voices_dir):
    for f in os.listdir(voices_dir):
        if f.endswith('.wav'):
            base_name = os.path.splitext(f)[0]
            wav_path = os.path.join(voices_dir, f)
            txt_path = os.path.join(voices_dir, f"{base_name}.txt")
            if os.path.exists(txt_path):
                with open(txt_path, 'r') as tf:
                    ref_text = tf.read().strip()
                try:
                    voice_instruct = None
                    if base_name == "Rebeca":
                        voice_instruct = "A bright, agile female voice with a natural upward lift, delivering lines at a brisk, energetic pace. Pitch leans high with spark, volume projects clearly—near-shouting at peaks. Ghanaian-British accent."
                    
                    voice = FasterQwenVoice(
                        name=base_name,
                        ref_audio=wav_path,
                        ref_text=ref_text,
                        language="English",
                        instruct=voice_instruct
                    )
                    voice.original_instruct = voice_instruct
                    loaded_voices[base_name] = voice
                    print(f"Loaded voice: {base_name}")
                except Exception as e:
                    print(f"Failed to load voice {base_name}: {e}")

try:
    # Use first available voice as default, or fallback to dummy
    default_voice = list(loaded_voices.values())[0] if loaded_voices else FasterQwenVoice(
        name="demo",
        ref_audio=os.getenv("REF_AUDIO", "reference.wav"),
        ref_text=os.getenv("REF_TEXT", "This is a reference text.")
    )
    engine = FasterQwenEngine(device="cuda", voice=default_voice)
    print("Faster Qwen TTS Engine initialized successfully on CUDA.")
except Exception as e:
    print(f"Error initializing Faster Qwen TTS Engine: {e}")
    from RealtimeTTS import SystemEngine
    engine = SystemEngine()


class TTSRequest(BaseModel):
    model: str
    input: str
    voice: Optional[str] = None
    response_format: Optional[str] = "wav"
    speed: Optional[float] = 1.0
    instruct: Optional[str] = None
engine_lock = threading.Lock()

@app.post("/v1/audio/speech")
def generate_speech(request: TTSRequest):
    cleaned_input = strip_think_blocks(request.input)
    if not cleaned_input:
        raise HTTPException(status_code=400, detail="Input text is empty.")
    
    engine_lock.acquire()
    try:
        # Switch voice if requested and available
        req_voice = request.voice if request.voice else "Abena"
        if req_voice in loaded_voices and getattr(engine, 'set_voice', None):
            try:
                voice_obj = loaded_voices[req_voice]
                engine.set_voice(voice_obj)
                # Apply dynamic instruct prompt if passed, otherwise fall back to original
                instruct_to_use = request.instruct if request.instruct is not None else getattr(voice_obj, 'original_instruct', voice_obj.instruct)
                engine.set_voice_parameters(instruct=instruct_to_use)
            except Exception as e:
                print(f"Failed to switch voice to {req_voice}: {e}")
                
        def synthesize_worker(text):
            # Clear queue
            while not engine.queue.empty():
                engine.queue.get()
            engine.synthesize(text)
            # Signal end of stream
            engine.queue.put(None)

        def audio_stream_generator(text):
            try:
                # Start generation in a background thread so we can stream
                gen_thread = threading.Thread(target=synthesize_worker, args=(text,))
                gen_thread.start()

                # Start FFmpeg to stream raw PCM to MP3 on the fly
                process = subprocess.Popen(
                    ["ffmpeg", "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", "pipe:0", "-f", "mp3", "-b:a", "128k", "pipe:1"],
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.DEVNULL,
                    bufsize=0
                )

                def write_to_ffmpeg():
                    while True:
                        chunk = engine.queue.get()
                        if chunk is None:
                            try:
                                process.stdin.close()
                            except:
                                pass
                            break
                        try:
                            process.stdin.write(chunk)
                            process.stdin.flush()
                        except Exception:
                            break

                writer_thread = threading.Thread(target=write_to_ffmpeg)
                writer_thread.start()

                # Yield chunks as soon as FFmpeg produces them
                while True:
                    data = process.stdout.read(4096)
                    if not data:
                        break
                    yield data

                process.wait()
                writer_thread.join()
                gen_thread.join()
            finally:
                engine_lock.release()

        return StreamingResponse(
            audio_stream_generator(cleaned_input),
            media_type="audio/mpeg"
        )
    except Exception as e:
        engine_lock.release()
        raise HTTPException(status_code=500, detail=str(e))



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
