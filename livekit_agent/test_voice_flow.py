import asyncio
import os
import sys
import time
import subprocess
from gtts import gTTS
import soundfile as sf
from livekit import api, rtc

# Load environment variables manually from .env
def load_env(env_path):
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, val = line.split('=', 1)
                    # Remove quotes if present
                    val = val.strip('"\'')
                    os.environ[key] = val
        print(f"Loaded environment variables from {env_path}")

# Flag to mark success
test_passed = False
agent_message_received = None

async def main():
    global test_passed, agent_message_received

    # Setup paths
    mp3_path = "voice_command.mp3"
    wav_path = "voice_command.wav"
    
    # Text command that will trigger the agent to call 'send_message_to_chat'
    text_command = "send to chat, hello world"
    print(f"Generating voice command via gTTS: '{text_command}'")
    
    # 2. Generate MP3 and convert to WAV
    try:
        tts = gTTS(text=text_command, lang='en')
        tts.save(mp3_path)
        print(f"Saved temp audio to {mp3_path}")
        
        # Convert to mono 16kHz WAV format
        print("Converting MP3 to WAV via FFmpeg...")
        subprocess.run([
            "ffmpeg", "-y", "-i", mp3_path, 
            "-ac", "1", "-ar", "16000", wav_path
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print(f"Successfully created WAV file: {wav_path}")
    except Exception as e:
        print(f"Audio generation failed: {e}")
        return

    # 3. Read audio data
    if not os.path.exists(wav_path):
        print(f"Error: WAV file not found at {wav_path}")
        return
        
    data, sample_rate = sf.read(wav_path, dtype='int16')
    channels = len(data.shape) if len(data.shape) > 1 else 1
    print(f"WAV loaded: {len(data)} samples, {sample_rate}Hz, {channels} channel(s)")

    # Load environment
    load_env("../.env")

    # 4. Read LiveKit environment variables
    api_key = os.environ.get("LIVEKIT_API_KEY", "YOUR_LIVEKIT_API_KEY")
    api_secret = os.environ.get("LIVEKIT_API_SECRET", "YOUR_LIVEKIT_API_SECRET")
    ws_url = os.environ.get("LIVEKIT_URL") or os.environ.get("LIVEKIT_WS_URL", "wss://example-livekit.com")

    # Use room name from argument if passed, else generate one
    if len(sys.argv) > 1:
        room_name = sys.argv[1]
        print(f"Using provided Room Name: {room_name}")
    else:
        room_name = f"hstai-test-flow-{int(time.time())}"
        print(f"Generated dynamic Room Name: {room_name}")
    
    print(f"--------------------------------------")
    print(f"Room:        {room_name}")
    print(f"WS URL:      {ws_url}")
    print(f"--------------------------------------")

    print("Generating LiveKit Access Token...")
    token = (
        api.AccessToken(api_key, api_secret)
        .with_grants(api.VideoGrants(room_join=True, room=room_name))
        .with_identity("test_voice_pusher")
        .with_name("Voice Pusher Test")
        .to_jwt()
    )

    room = rtc.Room()
    
    # Register events
    @room.on("data_received")
    def on_data_received(data_packet: rtc.DataPacket):
        global test_passed, agent_message_received
        topic = data_packet.topic
        try:
            message = data_packet.data.decode("utf-8")
        except Exception:
            message = str(data_packet.data)
            
        print(f"[Room Event] Data packet received on topic '{topic}': {message}")
        if topic == "lk.chat":
            agent_message_received = message
            test_passed = True

    @room.on("participant_connected")
    def on_participant_connected(participant: rtc.RemoteParticipant):
        print(f"[Room Event] Participant connected: {participant.identity} ({participant.name})")

    print("Connecting to room...")
    await room.connect(ws_url, token)
    print("Connected successfully!")

    # Publish microphone track
    source = rtc.AudioSource(sample_rate, channels)
    track = rtc.LocalAudioTrack.create_audio_track("microphone", source)
    options = rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE)
    
    print("Publishing microphone track...")
    publication = await room.local_participant.publish_track(track, options)
    print("Microphone track published!")

    # Feed the audio file
    print("Feeding voice command audio stream into the room...")
    chunk_duration = 0.02  # 20ms chunks
    chunk_samples = int(sample_rate * chunk_duration)
    
    for i in range(0, len(data), chunk_samples):
        chunk = data[i:i + chunk_samples]
        if len(chunk) < chunk_samples:
            break
        frame = rtc.AudioFrame(chunk.tobytes(), sample_rate, channels, len(chunk))
        await source.capture_frame(frame)
        await asyncio.sleep(chunk_duration)

    print("Audio feeding complete. Waiting for agent tool response...")
    
    # Wait for up to 25 seconds for the message to be received on topic 'lk.chat'
    for _ in range(50):
        if test_passed:
            break
        await asyncio.sleep(0.5)

    print("Disconnecting from room...")
    await room.disconnect()
    print("Disconnected.")

    print(f"--------------------------------------")
    if test_passed:
        print(f"✅ TEST PASSED!")
        print(f"Agent sent chat message: '{agent_message_received}'")
    else:
        print(f"❌ TEST FAILED: Did not receive message from agent on topic 'lk.chat'.")
    print(f"--------------------------------------")

    # Cleanup temp files
    for path in [mp3_path, wav_path]:
        if os.path.exists(path):
            os.remove(path)

if __name__ == "__main__":
    asyncio.run(main())
