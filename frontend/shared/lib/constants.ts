const getDefaultApiBaseUrl = () => {
	if (typeof window === "undefined") {
		return "http://localhost:8000";
	}
	return `${window.location.protocol}//${window.location.hostname}:8000`;
};

const toWsOrigin = (origin: string) => {
	if (origin.startsWith("https://")) {
		return `wss://${origin.slice("https://".length)}`;
	}
	if (origin.startsWith("http://")) {
		return `ws://${origin.slice("http://".length)}`;
	}
	return origin;
};

export const API_BASE_URL =
	process.env.NEXT_PUBLIC_BACKEND_URL ?? getDefaultApiBaseUrl();

export const WS_URL =
	process.env.NEXT_PUBLIC_WS_URL ?? `${toWsOrigin(API_BASE_URL)}/ws/stream`;
