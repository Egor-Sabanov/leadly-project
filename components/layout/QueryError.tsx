export function QueryError({ message }: { message: string }) {
  return (
    <div className="auth-message error" role="alert">
      <strong>Данные не загрузились.</strong> {message}
      <br />
      Обнови страницу. Если ошибка повторяется, проверь подключение и применение
      миграций.
    </div>
  );
}
