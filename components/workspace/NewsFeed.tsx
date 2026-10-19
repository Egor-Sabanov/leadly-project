"use client";

import { useState } from "react";
import { ArrowUpRight, Newspaper } from "lucide-react";
import type { NewsItem } from "@/lib/industry-news";

type Source = { id: string; label: string; publisher: string; site: string };
export function NewsFeed({
  items,
  sources,
}: {
  items: NewsItem[];
  sources: Source[];
}) {
  const [category, setCategory] = useState("all");
  const seen = new Set<string>();
  const visible =
    category === "all"
      ? sources.flatMap((source) =>
          items
            .filter(
              (item) => item.category === source.id && !seen.has(item.url),
            )
            .slice(0, 1)
            .map((item) => {
              seen.add(item.url);
              return item;
            }),
        )
      : items.filter((item) => item.category === category);
  const selected = sources.find((source) => source.id === category);
  return (
    <section className="industry-news" aria-labelledby="industry-news-title">
      <div className="news-heading">
        <div>
          <span className="eyebrow">ЖУРНАЛ</span>
          <h2 id="industry-news-title">В индустрии</h2>
        </div>
        <Newspaper size={22} aria-hidden="true" />
      </div>
      <div
        className="news-categories"
        role="group"
        aria-label="Темы публикаций"
      >
        {[{ id: "all", label: "Все темы" }, ...sources].map((source) => (
          <button
            type="button"
            key={source.id}
            className={source.id === category ? "selected" : ""}
            aria-pressed={source.id === category}
            onClick={() => setCategory(source.id)}
          >
            {source.label}
          </button>
        ))}
      </div>
      {visible.length ? (
        <div className="news-grid">
          {visible.map((item) => (
            <a
              className="news-card"
              key={item.url}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="news-category">
                {sources.find((source) => source.id === item.category)?.label}
                <ArrowUpRight size={17} aria-hidden="true" />
              </span>
              <h3>{item.title}</h3>
              <span className="news-credit">
                {item.publisher}
                <time dateTime={item.publishedAt}>
                  {new Date(item.publishedAt).toLocaleDateString("ru-RU", {
                    day: "numeric",
                    month: "short",
                    timeZone: "Europe/Moscow",
                  })}
                </time>
              </span>
            </a>
          ))}
        </div>
      ) : (
        <div className="panel news-empty">
          <p>
            Лента {selected?.publisher || "публикаций"} сейчас недоступна.
            Попробуй другую тему или открой издание.
          </p>
          <a
            href={selected?.site || sources[0].site}
            target="_blank"
            rel="noopener noreferrer"
            className="text-link"
          >
            Перейти к публикациям <ArrowUpRight size={15} />
          </a>
        </div>
      )}
      <p className="news-attribution">
        Публикации из открытых RSS Хабра и Cossa. Полный текст — на сайте
        издания.
      </p>
    </section>
  );
}
