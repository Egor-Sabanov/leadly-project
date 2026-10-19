import { Suspense } from "react";
import { DemoWorkspace } from "@/components/workspace/DemoWorkspace";
import { IndustryNews } from "@/components/workspace/IndustryNews";

export const dynamic = "force-dynamic";
export default function DemoPage() {
  return (
    <DemoWorkspace
      news={
        <Suspense
          fallback={
            <section className="panel news-loading">
              <h2>В индустрии</h2>
              <p className="muted">Загружаем публикации…</p>
            </section>
          }
        >
          <IndustryNews />
        </Suspense>
      }
    />
  );
}
