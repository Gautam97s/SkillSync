import CameraFeed from "../features/hand-tracking/components/CameraFeed";
import HandOverlay from "../features/hand-tracking/components/HandOverlay";
import FeedbackPanel from "../features/realtime-feedback/components/FeedbackPanel";
import Metrics from "../features/realtime-feedback/components/Metrics";
import StepTracker from "../features/step-tracker/components/StepTracker";

export default function HomePage() {
  return (
    <main className="page">
      <section className="left-panel">
        <CameraFeed />
        <HandOverlay />
      </section>
      <section className="right-panel">
        <StepTracker />
        <Metrics />
        <FeedbackPanel />
      </section>
    </main>
  );
}
