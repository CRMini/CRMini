export default function DetailItem({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="detail-item">
      <b>{label}</b>
      <span>{value?.trim() || "—"}</span>
    </div>
  );
}
