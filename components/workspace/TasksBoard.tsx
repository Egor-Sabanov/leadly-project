"use client";

import { AnimatedIcon } from "@/components/brand/AnimatedIcon";
import { useState, useId, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Check,
  CalendarDays,
  Plus,
  PencilLine,
  Trash2,
  ListTodo,
  LoaderCircle,
} from "lucide-react";
import {
  taskDateLabel,
  taskName,
  type WorkTask,
  type TaskClient,
} from "@/lib/tasks";

export function TasksBoard({
  initialTasks,
  clients,
  today,
  compact = false,
}: {
  initialTasks: WorkTask[];
  clients: TaskClient[];
  today: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const prefix = useId();
  const [tasks, setTasks] = useState(initialTasks);
  const [note, setNote] = useState("");
  const [dueDate, setDueDate] = useState(today);
  const [clientId, setClientId] = useState("");
  const [filter, setFilter] = useState("open");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState("");
  const [draft, setDraft] = useState("");
  const [draftDate, setDraftDate] = useState(today);
  const [draftClient, setDraftClient] = useState("");
  const [deleting, setDeleting] = useState("");
  const active = tasks.filter((task) => !task.completed_at);
  const filtered = tasks
    .filter(
      (task) =>
        filter === "all" ||
        (filter === "done" ? !!task.completed_at : !task.completed_at),
    )
    .sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for));
  const visible = compact ? filtered.slice(0, 4) : filtered;

  async function change(
    method: string,
    payload: Record<string, unknown>,
    marker: string,
  ) {
    setBusy(marker);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/tasks", {
        method,
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Не удалось сохранить дело.");
      if (method === "DELETE")
        setTasks((current) => current.filter((task) => task.id !== payload.id));
      else
        setTasks((current) => [
          ...current.filter((task) => task.id !== result.task.id),
          result.task,
        ]);
      setMessage(
        method === "DELETE"
          ? "Дело удалено."
          : method === "POST"
            ? "Дело добавлено."
            : "Изменения сохранены.",
      );
      router.refresh();
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Не удалось сохранить дело.",
      );
      return false;
    } finally {
      setBusy("");
    }
  }
  async function add(event: FormEvent) {
    event.preventDefault();
    if (
      await change("POST", { note, dueDate, clientId: clientId || null }, "new")
    ) {
      setNote("");
      setClientId("");
    }
  }
  const extraFields = (
    <div className="task-form-options">
      <label>
        Дата
        <input
          type="date"
          value={dueDate}
          min="2000-01-01"
          max="2099-12-31"
          required
          onChange={(event) => setDueDate(event.target.value)}
        />
      </label>
      <label>
        Клиент
        <select
          value={clientId}
          onChange={(event) => setClientId(event.target.value)}
        >
          <option value="">Без привязки</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
  return (
    <section
      className={`panel tasks-board ${compact ? "tasks-board--compact" : ""}`}
      aria-labelledby={`${prefix}-title`}
    >
      <div className="tasks-heading">
        <div>
          <span className="eyebrow">ТВОИ ДЕЛА</span>
          <h2 id={`${prefix}-title`}>
            <AnimatedIcon kind="time" /> План действий
          </h2>
        </div>
        {compact ? (
          <Link href="/tasks" className="text-link">
            Все дела <ArrowUpRight size={15} />
          </Link>
        ) : (
          <span className="task-count">{active.length} в работе</span>
        )}
      </div>
      <p className="tasks-description">
        Откликнуться, напомнить клиенту, подготовить портфолио — запиши
        следующий шаг.
      </p>
      <form className="task-add-form" onSubmit={add}>
        <div className="task-add-line">
          <label className="sr-only" htmlFor={`${prefix}-new`}>
            Новое дело
          </label>
          <input
            id={`${prefix}-new`}
            placeholder="Что нужно сделать?"
            value={note}
            maxLength={240}
            required
            onChange={(event) => setNote(event.target.value)}
          />
          <button className="primary" type="submit" disabled={!!busy}>
            {busy === "new" ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <Plus size={17} />
            )}
            <span>Добавить</span>
          </button>
        </div>
        {compact ? (
          <details className="task-extra">
            <summary>Дата и клиент</summary>
            {extraFields}
          </details>
        ) : (
          extraFields
        )}
      </form>
      {!tasks.length && (
        <div className="task-suggestions" aria-label="Идеи дел">
          {["Отправить отклик", "Написать клиенту", "Обновить портфолио"].map(
            (text) => (
              <button
                type="button"
                key={text}
                onClick={() => {
                  setNote(text);
                  document.getElementById(`${prefix}-new`)?.focus();
                }}
              >
                {text}
                <Plus size={12} />
              </button>
            ),
          )}
        </div>
      )}
      <div className="task-filters" role="group" aria-label="Статус дел">
        {[
          ["open", "В работе"],
          ["done", "Готово"],
          ["all", "Все"],
        ].map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={filter === value}
            className={filter === value ? "selected" : ""}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {visible.length ? (
        <div className="task-list">
          {visible.map((task) => (
            <article
              key={task.id}
              className={`task-row ${task.completed_at ? "is-complete" : ""}`}
            >
              {editing === task.id ? (
                <form
                  className="task-edit-form"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (
                      await change(
                        "PATCH",
                        {
                          id: task.id,
                          note: draft,
                          dueDate: draftDate,
                          clientId: draftClient || null,
                        },
                        task.id,
                      )
                    )
                      setEditing("");
                  }}
                >
                  <label>
                    Название дела
                    <input
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      maxLength={240}
                      required
                    />
                  </label>
                  <div className="task-form-options">
                    <label>
                      Дата дела
                      <input
                        type="date"
                        required
                        min="2000-01-01"
                        max="2099-12-31"
                        value={draftDate}
                        onChange={(event) => setDraftDate(event.target.value)}
                      />
                    </label>
                    <label>
                      Клиент дела
                      <select
                        value={draftClient}
                        onChange={(event) => setDraftClient(event.target.value)}
                      >
                        <option value="">Без привязки</option>
                        {clients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="task-edit-actions">
                    <button type="submit" className="primary" disabled={!!busy}>
                      <Check size={15} />
                      Сохранить дело
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setEditing("")}
                    >
                      Отмена
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <input
                    type="checkbox"
                    className="task-checkbox"
                    aria-label={`Выполнено: ${taskName(task)}`}
                    checked={!!task.completed_at}
                    disabled={!!busy}
                    onChange={(event) => {
                      const completed = event.target.checked;
                      const previous = task.completed_at;
                      setTasks((current) =>
                        current.map((row) =>
                          row.id === task.id
                            ? {
                                ...row,
                                completed_at: completed
                                  ? new Date().toISOString()
                                  : null,
                              }
                            : row,
                        ),
                      );
                      void change(
                        "PATCH",
                        { id: task.id, completed },
                        task.id,
                      ).then((saved) => {
                        if (!saved)
                          setTasks((current) =>
                            current.map((row) =>
                              row.id === task.id
                                ? { ...row, completed_at: previous }
                                : row,
                            ),
                          );
                      });
                    }}
                  />
                  <div className="task-copy">
                    <strong>{taskName(task)}</strong>
                    <div className="task-meta">
                      <span
                        className={
                          !task.completed_at &&
                          task.scheduled_for.slice(0, 10) < today
                            ? "is-overdue"
                            : ""
                        }
                      >
                        <CalendarDays size={12} />
                        {task.scheduled_for.slice(0, 10) === today
                          ? "Сегодня"
                          : taskDateLabel(task.scheduled_for)}
                      </span>
                      {task.clients?.name && (
                        <Link href="/clients">{task.clients.name}</Link>
                      )}
                    </div>
                  </div>
                  <div className="task-row-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Изменить дело: ${taskName(task)}`}
                      disabled={!!busy}
                      onClick={() => {
                        setEditing(task.id);
                        setDraft(taskName(task));
                        setDraftDate(task.scheduled_for.slice(0, 10));
                        setDraftClient(task.client_id || "");
                        setDeleting("");
                      }}
                    >
                      <PencilLine size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Удалить дело: ${taskName(task)}`}
                      disabled={!!busy}
                      onClick={() => setDeleting(task.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </>
              )}
              {deleting === task.id && (
                <div className="task-delete-confirm">
                  <span>Удалить это дело?</span>
                  <button
                    type="button"
                    className="ghost"
                    disabled={!!busy}
                    onClick={async () => {
                      if (await change("DELETE", { id: task.id }, task.id))
                        setDeleting("");
                    }}
                  >
                    Удалить
                  </button>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => setDeleting("")}
                  >
                    Отмена
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="task-empty">
          <ListTodo size={23} aria-hidden="true" />
          <p>
            {filter === "done"
              ? "Завершённые дела появятся здесь."
              : !tasks.length
                ? "Добавь первое дело — и держи следующий шаг перед глазами."
                : "В этой части списка пока нет дел."}
          </p>
        </div>
      )}
      {compact && filtered.length > visible.length && (
        <Link href="/tasks" className="text-link task-more">
          Показать ещё {filtered.length - visible.length}{" "}
          <ArrowUpRight size={14} />
        </Link>
      )}
      {error && (
        <p role="alert" className="auth-message error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="task-notice">
          {message}
        </p>
      )}
    </section>
  );
}
