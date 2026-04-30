export type SourceAddModeId =
  | "website"
  | "web_feed"
  | "track_changes"
  | "google_news"
  | "bluesky"
  | "facebook"
  | "telegram"
  | "newsletter"
  | "import_feeds"
  | "monitoring"
  | "podcast";

export type SourceAddModeDefinition = {
  id: SourceAddModeId;
  label: string;
  description: string;
  enabled: boolean;
};

export const sourceAddModes: SourceAddModeDefinition[] = [
  {
    id: "website",
    label: "Strona",
    description: "Wykryj RSS ze strony głównej albo domeny.",
    enabled: true,
  },
  {
    id: "web_feed",
    label: "RSS / Atom",
    description: "Wklej bezpośredni adres feedu.",
    enabled: true,
  },
  {
    id: "track_changes",
    label: "Śledzenie zmian",
    description: "Monitorowanie zmian poza klasycznym RSS.",
    enabled: false,
  },
  {
    id: "google_news",
    label: "Google News",
    description: "Tematyczne feedy z agregatora wiadomości.",
    enabled: false,
  },
  {
    id: "bluesky",
    label: "Bluesky",
    description: "Strumienie społecznościowe i custom feeds.",
    enabled: false,
  },
  {
    id: "facebook",
    label: "Facebook",
    description: "Strony i posty publikowane poza RSS.",
    enabled: false,
  },
  {
    id: "telegram",
    label: "Telegram",
    description: "Kanały i wiadomości spoza zwykłego feeda.",
    enabled: false,
  },
  {
    id: "newsletter",
    label: "Newsletter",
    description: "Źródła email i digesty.",
    enabled: false,
  },
  {
    id: "import_feeds",
    label: "Import OPML",
    description: "Przenieś feedy z OPML albo innego czytnika.",
    enabled: true,
  },
  {
    id: "monitoring",
    label: "Monitoring",
    description: "Query-driven feedy i monitoring słów kluczowych.",
    enabled: false,
  },
  {
    id: "podcast",
    label: "Podcast",
    description: "Audio feedy i seriale odcinkowe.",
    enabled: false,
  },
];
