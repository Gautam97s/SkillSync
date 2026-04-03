"use client";

import { useEffect, useRef, useState } from "react";
import { WS_URL } from "../../../shared/lib/constants";
import type { FrameResponse } from "../../../shared/lib/types";

export function useWebSocket() {
  const socketRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [latest, setLatest] = useState<FrameResponse | null>(null);

  useEffect(() => {
    const socket = new WebSocket(WS_URL);
    socketRef.current = socket;

    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as FrameResponse;
        setLatest(payload);
      } catch {
        // Ignore malformed messages from backend.
      }
    };

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, []);

  const send = (payload: unknown) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
    }
  };

  return { connected, latest, send };
}
