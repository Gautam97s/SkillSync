type StepItemProps = {
  label: string;
  status: "completed" | "active" | "pending" | string;
};

export default function StepItem({ label, status }: StepItemProps) {
  return (
    <div className={`step-item step-${status}`}>
      <span>{label}</span>
      <strong>{status}</strong>
    </div>
  );
}
