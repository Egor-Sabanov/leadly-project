export default function Loading() {
  return (
    <div
      className="content"
      aria-label="Загрузка рабочего пространства"
      role="status"
    >
      <div className="eyebrow">ЗАГРУЖАЕМ ТВОЁ ПРОСТРАНСТВО…</div>
      <div className="skeleton" style={{ height: 260, marginBottom: 20 }} />
      <div className="two-col">
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
    </div>
  );
}
