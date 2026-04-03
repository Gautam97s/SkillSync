"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { WS_URL } from "../lib/constants";
import type { FrameResponse } from "../lib/types";

interface TelemetryContextValue {
  connected: boolean;
  latest: FrameResponse | null;
  send: (payload: unknown) => void;
}

const TelemetryContext = createContext<TelemetryContextValue | null>(null);

export function TelemetryProvider({ children }: { children: React.ReactNode }) {
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
        // Ignore
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

  return (
    <TelemetryContext.Provider value={{ connected, latest, send }}>
      {children}
    </TelemetryContext.Provider>
  );
}

export function useTelemetry() {
  const ctx = useContext(TelemetryContext);
  if (!ctx) {
    throw new Error("useTelemetry must be used within a TelemetryProvider");
  }
  return ctx;
}
