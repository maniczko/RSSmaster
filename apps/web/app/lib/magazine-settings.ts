import type { MagazineSettings, MagazineSettingsDraft } from "@/app/lib/channel-lab-types";

export type MagazineSettingsPatch = {
  frequency?: MagazineSettings["frequency"];
  timezone?: string;
  time_of_day?: string;
  day_of_week?: number | null;
  article_limit?: number;
  source_scope?: MagazineSettings["source_scope"];
  output_format?: MagazineSettings["output_format"];
  kindle_delivery_enabled?: boolean;
};

const DEFAULT_MAGAZINE_SETTINGS = {
  articleLimit: 25,
  dayOfWeek: 1,
  frequency: "disabled" as MagazineSettings["frequency"],
  outputFormat: "epub" as MagazineSettings["output_format"],
  sourceScope: "digest_candidates" as MagazineSettings["source_scope"],
  timeOfDay: "07:00",
  timezone: "Europe/Warsaw",
};

export function createMagazineSettingsDraft(settings: MagazineSettings | null): MagazineSettingsDraft {
  return {
    article_limit: String(settings?.article_limit ?? DEFAULT_MAGAZINE_SETTINGS.articleLimit),
    day_of_week: String(settings?.day_of_week ?? DEFAULT_MAGAZINE_SETTINGS.dayOfWeek),
    frequency: settings?.frequency ?? DEFAULT_MAGAZINE_SETTINGS.frequency,
    kindle_delivery_enabled: settings?.kindle_delivery_enabled ?? false,
    output_format: settings?.output_format ?? DEFAULT_MAGAZINE_SETTINGS.outputFormat,
    source_scope: settings?.source_scope ?? DEFAULT_MAGAZINE_SETTINGS.sourceScope,
    time_of_day: settings?.time_of_day ?? DEFAULT_MAGAZINE_SETTINGS.timeOfDay,
    timezone: settings?.timezone ?? DEFAULT_MAGAZINE_SETTINGS.timezone,
  };
}

export function buildMagazineSettingsPatch(
  draft: MagazineSettingsDraft,
  current: MagazineSettings | null,
): MagazineSettingsPatch {
  const patch: MagazineSettingsPatch = {};
  const timezone = draft.timezone.trim() || DEFAULT_MAGAZINE_SETTINGS.timezone;
  const timeOfDay = draft.time_of_day.trim() || DEFAULT_MAGAZINE_SETTINGS.timeOfDay;
  const parsedDayOfWeek = Number.parseInt(draft.day_of_week, 10);
  const dayOfWeek = Number.isFinite(parsedDayOfWeek) ? parsedDayOfWeek : DEFAULT_MAGAZINE_SETTINGS.dayOfWeek;
  const parsedArticleLimit = Number.parseInt(draft.article_limit, 10);
  const articleLimit = Number.isFinite(parsedArticleLimit)
    ? parsedArticleLimit
    : DEFAULT_MAGAZINE_SETTINGS.articleLimit;

  if (!current || draft.frequency !== current.frequency) {
    patch.frequency = draft.frequency;
  }
  if (!current || timezone !== current.timezone) {
    patch.timezone = timezone;
  }
  if (!current || timeOfDay !== current.time_of_day) {
    patch.time_of_day = timeOfDay;
  }
  if (!current || dayOfWeek !== current.day_of_week) {
    patch.day_of_week = dayOfWeek;
  }
  if (!current || articleLimit !== current.article_limit) {
    patch.article_limit = articleLimit;
  }
  if (!current || draft.source_scope !== current.source_scope) {
    patch.source_scope = draft.source_scope;
  }
  if (!current || draft.output_format !== current.output_format) {
    patch.output_format = draft.output_format;
  }
  if (!current || draft.kindle_delivery_enabled !== current.kindle_delivery_enabled) {
    patch.kindle_delivery_enabled = draft.kindle_delivery_enabled;
  }

  return patch;
}
