"use client";

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { WS_URL } from "../lib/constants";
import type { FrameResponse } from "../lib/types";

interface TelemetryContextValue {
  connected: boolean;
  /** True while socket is down but we are retrying (not a user-visible fatal error). */
  reconnecting: boolean;
  latest: FrameResponse | null;
  send: (payload: unknown) => void;
}

const TelemetryContext = createContext<TelemetryContextValue | null>(null);

const INITIAL_BACKOFF_MS = 400;
const MAX_BACKOFF_MS = 10_000;

export function TelemetryProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(INITIAL_BACKOFF_MS);
  const disposedRef = useRef(false);

  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [latest, setLatest] = useState<FrameResponse | null>(null);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    disposedRef.current = false;

    const scheduleReconnect = () => {
      if (disposedRef.current) {
        return;
      }
      clearReconnectTimer();
      const delay = backoffRef.current;
      backoffRef.current = Math.min(MAX_BACKOFF_MS, Math.round(delay * 1.6));
      setReconnecting(true);
      reconnectTimerRef.current = window.setTimeout(connect, delay);
    };

    const connect = () => {
      if (disposedRef.current) {
        return;
      }
      clearReconnectTimer();

      try {
        const socket = new WebSocket(WS_URL);
        socketRef.current = socket;

        socket.onopen = () => {
          backoffRef.current = INITIAL_BACKOFF_MS;
          setConnected(true);
          setReconnecting(false);
        };

        socket.onclose = () => {
          setConnected(false);
          socketRef.current = null;
          if (!disposedRef.current) {
            scheduleReconnect();
          }
        };

        socket.onerror = () => {
          // onclose always follows; no extra work
        };

        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data) as FrameResponse;
            setLatest(payload);
          } catch (e) {
            if (process.env.NODE_ENV === "development") {
              console.warn("[SkillSync] Telemetry JSON parse failed", e);
            }
          }
        };
      } catch {
        scheduleReconnect();
      }
    };

    connect();

    return () => {
      disposedRef.current = true;
      clearReconnectTimer();
      setReconnecting(false);
      socketRef.current?.close();
      socketRef.current = null;
      setConnected(false);
    };
  }, [clearReconnectTimer]);

  const send = useCallback((payload: unknown) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
    }
  }, []);

  return (
    <TelemetryContext.Provider value={{ connected, reconnecting, latest, send }}>
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
