export function QueryError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="auth-message error" role="alert">
      <strong>Не удалось загрузить данные.</strong>
      <br />Обнови страницу или попробуй чуть позже.
    </div>
  );
}
