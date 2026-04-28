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
    description: "Wykryj RSS ze strony glownej albo domeny.",
    enabled: true,
  },
  {
    id: "web_feed",
    label: "RSS / Atom",
    description: "Wklej bezposredni adres feedu.",
    enabled: true,
  },
  {
    id: "track_changes",
    label: "Sledzenie zmian",
    description: "Monitorowanie zmian poza klasycznym RSS.",
    enabled: false,
  },
  {
    id: "google_news",
    label: "Google News",
    description: "Tematyczne feedy z agregatora wiadomosci.",
    enabled: false,
  },
  {
    id: "bluesky",
    label: "Bluesky",
    description: "Strumienie spolecznosciowe i custom feeds.",
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
    description: "Kanaly i wiadomosci spoza zwyklego feeda.",
    enabled: false,
  },
  {
    id: "newsletter",
    label: "Newsletter",
    description: "Zrodla email i digesty.",
    enabled: false,
  },
  {
    id: "import_feeds",
    label: "Import OPML",
    description: "Przenies feedy z OPML albo innego czytnika.",
    enabled: true,
  },
  {
    id: "monitoring",
    label: "Monitoring",
    description: "Query-driven feedy i monitoring slow kluczowych.",
    enabled: false,
  },
  {
    id: "podcast",
    label: "Podcast",
    description: "Audio feedy i seriale odcinkowe.",
    enabled: false,
  },
];
