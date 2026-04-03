# GripSense Frontend

Next.js App Router frontend scaffold for the GripSense real-time coaching interface.

## Run

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start dev server:
   ```bash
   npm run dev
   ```

## Structure

- `app` - Next.js App Router entry points
- `features/hand-tracking` - Camera UI, overlay UI, camera hooks, and landmark normalization
- `features/realtime-feedback` - Feedback UI and WebSocket client logic
- `features/step-tracker` - Procedural step tracker components
- `shared` - Cross-feature hooks and shared TypeScript constants/types
- `styles` - Global styles
