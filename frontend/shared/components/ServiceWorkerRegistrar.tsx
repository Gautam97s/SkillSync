"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn("Service worker registration failed:", error);
      }
    };

    void register();
  }, []);

  return null;
}
