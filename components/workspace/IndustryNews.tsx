import { loadIndustryNews, newsSources } from "@/lib/industry-news";
import { NewsFeed } from "./NewsFeed";

export async function IndustryNews() {
  const items = await loadIndustryNews();
  return (
    <NewsFeed
      items={items}
      sources={newsSources.map(({ id, label, publisher, site }) => ({
        id,
        label,
        publisher,
        site,
      }))}
    />
  );
}
