import React, { useState, useEffect, useRef, useCallback } from 'react';
import DropdownMenu from './DropDownMenu';

const CameraFeed = ({ onClose, textAreaRef, isSpeaking }) => {
  const [videoInputDevices, setVideoInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoInputDeviceId, setSelectedVideoInputDeviceId] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const getVideoInputDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(
        (device) => device.kind === 'videoinput',
      ) as MediaDeviceInfo[];
      setVideoInputDevices(videoDevices);
      if (videoDevices.length > 0) {
        setSelectedVideoInputDeviceId(videoDevices[0].deviceId);
      }
    } catch (error) {
      console.error('Error fetching video input devices:', error);
    }
  }, []);

  const startVideoStream = useCallback(async () => {
    try {
      const constraints =
        selectedVideoInputDeviceId === 'screen'
          ? { video: { cursor: 'always' } }
          : { video: { deviceId: { exact: selectedVideoInputDeviceId } } };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        await videoRef.current.play();
      }
    } catch (error) {
      console.error('Error accessing webcam:', error);
    }
  }, [selectedVideoInputDeviceId]);

  const stopVideoStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const takeScreenshot = async () => {
    if (!canvasRef.current || !videoRef.current) {
      return;
    }

    const context = canvasRef.current.getContext('2d');
    if (!context) {
      return;
    }
    console.log('Taking screenshot...');
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    context.drawImage(
      videoRef.current,
      0,
      0,
      videoRef.current.videoWidth,
      videoRef.current.videoHeight,
    );

    const dataURL = canvasRef.current.toDataURL('image/png');

    const response = await fetch(dataURL);
    const blob = await response.blob();
    const file = new File([blob], 'screenshot.png', { type: 'image/png' });

    const clipboardData = new DataTransfer();
    clipboardData.items.add(file);

    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData: clipboardData,
      bubbles: true,
      cancelable: true,
    });

    if (textAreaRef.current) {
      textAreaRef.current.focus();
      textAreaRef.current.dispatchEvent(pasteEvent);
    }
  };

  useEffect(() => {
    getVideoInputDevices();
    return () => {
      stopVideoStream();
    };
  }, [getVideoInputDevices, stopVideoStream]);

  useEffect(() => {
    if (selectedVideoInputDeviceId) {
      startVideoStream();
    }
  }, [selectedVideoInputDeviceId, startVideoStream]);

  useEffect(() => {
    if (isSpeaking) {
      takeScreenshot();
    }
  }, [isSpeaking]);

  const handleDeviceChange = (deviceId: string) => {
    setSelectedVideoInputDeviceId(deviceId);
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
          stopVideoStream();
          onClose();
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="size-5 text-white"
        >
          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
        </svg>
      </button>
      {videoInputDevices.length > 1 && (
        <button
          type="button"
          className="absolute bottom-4 right-4 cursor-pointer rounded-md bg-black/10 p-1.5 text-white backdrop-blur-xl md:bottom-8"
        >
          <DropdownMenu devices={videoInputDevices} onSelect={handleDeviceChange} />
        </button>
      )}
    </div>
  );
};

export default CameraFeed;
