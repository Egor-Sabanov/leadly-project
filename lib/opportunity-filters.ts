import { disciplines, opportunityDisciplines } from "./disciplines";

export type OpportunityFilters = {
  query: string;
  discipline: string;
  type: string;
  sort: "relevance" | "match" | "newest";
  format: "all" | "remote" | "unspecified" | "onsite";
  saved: boolean;
  scope: "all" | "profile";
};
export const defaultOpportunityFilters: OpportunityFilters = {
  query: "", discipline: "all", type: "all", sort: "relevance", format: "all", saved: false, scope: "all",
};
export function normalizeOpportunityFilters(value: unknown): OpportunityFilters {
  const v = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    query: typeof v.query === "string" ? v.query.slice(0, 200) : "",
    discipline: disciplines.some(d => d.id === v.discipline) ? String(v.discipline) : "all",
    type: ["project", "freelance", "client", "job", "other"].includes(String(v.type)) ? String(v.type) : "all",
    sort: v.sort === "match" || v.sort === "newest" ? v.sort : "relevance",
    format: v.format === "remote" || v.format === "unspecified" || v.format === "onsite" ? v.format : "all",
    saved: v.saved === true,
    scope: v.scope === "profile" ? "profile" : "all",
  };
}
export function opportunityFiltersFromParams(params: URLSearchParams, defaultScope: "all" | "profile" = "all"): OpportunityFilters {
  return normalizeOpportunityFilters({ query: params.get("q"), discipline: params.get("direction"), type: params.get("type"), sort: params.get("sort"), format: params.get("format"), saved: params.get("saved") === "1", scope: params.get("scope") || defaultScope });
}
export const opportunityFilterParams = ["q", "direction", "type", "sort", "format", "saved", "scope"];
export function opportunityFilterSearch(filters: OpportunityFilters, existing = "") {
  const params = new URLSearchParams(existing);
  for (const key of opportunityFilterParams) params.delete(key);
  if (filters.query) params.set("q", filters.query);
  if (filters.discipline !== "all") params.set("direction", filters.discipline);
  if (filters.type !== "all") params.set("type", filters.type);
  if (filters.sort !== "relevance") params.set("sort", filters.sort);
  if (filters.format !== "all") params.set("format", filters.format);
  if (filters.saved) params.set("saved", "1");
  params.set("scope", filters.scope);
  return params.toString();
}

export type OpportunityProfileSelection = { configured: boolean; directions: string[]; types: string[] };
export function profileOpportunitySelection(profile: { completed?: boolean | null; headline?: string | null; skills: string[]; services: string[]; types?: string[] | null }): OpportunityProfileSelection {
  return {
    configured: Boolean(profile.completed && (profile.headline?.trim() || profile.skills.length || profile.services.length)),
    directions: opportunityDisciplines({ title: profile.headline, description: [...profile.skills, ...profile.services].join(" ") }),
    types: profile.types || [],
  };
}
export function matchesProfileSelection(item: { type: string; matched_keywords?: string[] }, directions: readonly string[], selection: OpportunityProfileSelection) {
  if (!selection.configured) return true;
  const types = new Set(selection.types);
  if (types.has("freelance")) { types.add("project"); types.add("client"); }
  if (types.size && !types.has(item.type)) return false;
  return selection.directions.length ? directions.some(id => selection.directions.includes(id)) : Boolean(item.matched_keywords?.length);
}

/** A missing remote flag is unknown, never evidence of office work. */
export function opportunityWorkFormat(item: { remote?: boolean; title?: string; description?: string | null }) {
  const text = `${item.title || ""} ${item.description || ""}`.slice(0, 12000).replace(/<[^>]*>/g, " ");
  if (/не\s+удал[её]н|только\s+(?:в\s+)?офис|работа\s+в\s+офисе|офисный\s+формат|присутствие\s+(?:в\s+офисе|на\s+месте)/iu.test(text)) return "onsite";
  if (item.remote) return "remote";
  return "unspecified";
}
