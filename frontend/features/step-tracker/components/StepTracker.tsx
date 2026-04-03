import StepItem from "./StepItem";

const steps = [
  { label: "Step 1: Prepare grip", status: "completed" },
  { label: "Step 2: Align fingers", status: "active" },
  { label: "Step 3: Stabilize hold", status: "pending" },
];

export default function StepTracker() {
  return (
    <div className="card">
      <h2>Step Tracker</h2>
      {steps.map((step) => (
        <StepItem key={step.label} label={step.label} status={step.status} />
      ))}
    </div>
  );
}
