/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: ".next-runtime",
  allowedDevOrigins: [
    "ea27-122-15-186-200.ngrok-free.app",
    "*.ngrok-free.app",
  ],
};

module.exports = nextConfig;
