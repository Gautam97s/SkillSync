"use client";

import { useEffect, useRef } from "react";

export function useAnimationFrame(callback: (time: number) => void) {
  const requestRef = useRef<number | null>(null);

  useEffect(() => {
    const tick = (time: number) => {
      callback(time);
      requestRef.current = requestAnimationFrame(tick);
    };

    requestRef.current = requestAnimationFrame(tick);

    return () => {
      if (requestRef.current !== null) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [callback]);
}
