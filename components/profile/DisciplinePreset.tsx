"use client";
import { useState } from "react";
import { disciplines } from "@/lib/disciplines";
export function DisciplinePreset({
  onApply,
}: {
  onApply: (headline: string, skills: readonly string[]) => void;
}) {
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  return (
    <div className="discipline-preset">
      <label>
        Направление работы
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setMessage("");
          }}
        >
          <option value="">Выбери направление или опиши своё ниже</option>
          {disciplines.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="ghost"
        disabled={!selected}
        onClick={() => {
          const d = disciplines.find((d) => d.id === selected);
          if (d) {
            onApply(d.headline, d.skills);
            setMessage(
              "Описание заполнено, навыки добавлены. Проверь их и сохрани профиль.",
            );
          }
        }}
      >
        Использовать направление
      </button>
      <p className="profile-muted" role="status">
        {message ||
          "Название профессии можно изменить. Добавляй только навыки, которыми владеешь."}
      </p>
    </div>
  );
}
