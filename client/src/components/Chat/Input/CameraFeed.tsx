import React, { useRef, useEffect } from 'react';

interface CameraFeedProps {
  onClose: () => void;
  onScreenshot: (dataURL: string) => void;
}

const CameraFeed: React.FC<CameraFeedProps> = ({ onClose, onScreenshot }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch((error) => console.error('Error playing video:', error));
          };
        }
      } catch (error) {
        console.error('Error accessing camera:', error);
        onClose();
      }
    };

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [onClose]);

  const takeScreenshot = async () => {
    if (!canvasRef.current || !videoRef.current) {return;}

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d');

    if (!context) {return;}

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

    canvas.toBlob(async (blob) => {
      if (!blob) {return;}

      const item = new ClipboardItem({ 'image/png': blob });
      try {
        await navigator.clipboard.write([item]);
        console.log('Screenshot copied to clipboard as image');

        const reader = new FileReader();
        reader.onloadend = () => {
          onScreenshot(reader.result as string); // Passa o dataURL para a função onScreenshot
        };
        reader.readAsDataURL(blob);
      } catch (error) {
        console.error('Failed to write to clipboard: ', error);
      }
    }, 'image/png');
  };

  return (
    <div className="video-container relative flex h-[550px] max-h-full w-[400px] px-2 pb-4 pt-2 md:py-6">
      <video
        ref={videoRef}
        className="h-full min-w-full rounded-2xl object-cover object-center"
        playsInline
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <button
        type="button"
        className="absolute left-4 top-4 cursor-pointer rounded-full bg-black/10 p-1.5 text-white backdrop-blur-xl md:top-8"
        onClick={() => {
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
          }
          onClose();
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="size-6"
        >
          <path d="M5.28 4.22a.75.75 0 1 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 0 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
        </svg>
      </button>
      <button
        type="button"
        className="absolute right-4 top-4 cursor-pointer rounded-full bg-black/10 p-1.5 text-white backdrop-blur-xl md:top-8"
        onClick={takeScreenshot}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
          className="size-6"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 5.25v13.5M18.75 12H5.25" />
        </svg>
      </button>
    </div>
  );
};

export default CameraFeed;
