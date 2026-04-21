import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "rssmaster",
    short_name: "rssmaster",
    description: "Lokalny czytnik RSS z szybkim capture linkow do biblioteki.",
    scope: "/",
    start_url: "/read/inbox",
    display: "standalone",
    background_color: "#f4f7fb",
    theme_color: "#155eef",
    share_target: {
      action: "/capture",
      method: "GET",
      enctype: "application/x-www-form-urlencoded",
      params: {
        title: "title",
        text: "note",
        url: "url",
      },
    },
  };
}
