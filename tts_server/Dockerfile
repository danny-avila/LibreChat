FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-dev portaudio19-dev ffmpeg sox \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip3 install numpy typing_extensions
RUN pip3 install --no-cache-dir -r requirements.txt

COPY . .
COPY asound.conf /etc/asound.conf
RUN ffmpeg -f lavfi -i anullsrc=r=24000:cl=mono -t 1 -q:a 9 -acodec pcm_s16le reference.wav

EXPOSE 8080
CMD ["python3", "tts_server.py"]
