type ScoreProps = { label: string; value: number };

export function Score({ label, value }: ScoreProps) {
  return (
    <div className="score">
      <span>{label}</span>
      <strong>{value}%</strong>
    </div>
  );
}
