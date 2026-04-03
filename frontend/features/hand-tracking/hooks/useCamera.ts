"use client";

import { useEffect, useRef, useState } from "react";

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [streamReady, setStreamReady] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;

    const setup = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setStreamReady(true);
        }
      } catch {
        setStreamReady(false);
      }
    };

    setup();

    return () => {
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return { videoRef, streamReady };
}
