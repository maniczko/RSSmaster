import { describe, expect, it } from "vitest";

import {
  isReaderBoilerplateLine,
  normalizeReaderText,
  sanitizeReaderParagraphs,
  shouldDropReaderParagraph,
} from "./reader-cleanup";

describe("reader cleanup helpers", () => {
  it("normalizes reader whitespace", () => {
    expect(normalizeReaderText("  A   B \n C ")).toBe("A B C");
  });

  it("recognizes common boilerplate lines in Polish", () => {
    expect(isReaderBoilerplateLine("Źródło artykułu: Money.pl")).toBe(true);
    expect(isReaderBoilerplateLine("Źródło zdjęć: Money.pl")).toBe(true);
    expect(isReaderBoilerplateLine("Dźwięk został wygenerowany automatycznie")).toBe(true);
    expect(isReaderBoilerplateLine("Lumina Metals idzie na GPW")).toBe(false);
  });

  it("drops duplicated heading echoes and timestamp lines", () => {
    const paragraphs = [
      "Kurs franka nadal spada",
      "Kurs franka nadal spada 17.04.2026 - godz.19:28",
      "Kurs franka nadal spada do 4,59 zł po spokojnej sesji.",
    ];

    expect(shouldDropReaderParagraph(paragraphs, 0, null)).toBe(true);
    expect(shouldDropReaderParagraph(paragraphs, 1, null)).toBe(true);
    expect(shouldDropReaderParagraph(paragraphs, 2, null)).toBe(false);
  });

  it("drops short kurs headings when the next line is only a value list", () => {
    const paragraphs = [
      "Kurs funta szterlinga",
      "\"wobec złotego: 4.85690\"",
    ];

    expect(shouldDropReaderParagraph(paragraphs, 0, null)).toBe(true);
    expect(shouldDropReaderParagraph(paragraphs, 1, null)).toBe(false);
  });

  it("removes title duplicates, boilerplate, and short echoes from fallback paragraphs", () => {
    expect(
      sanitizeReaderParagraphs(
        [
          "Ile kosztuje funt? Kurs funta do złotego PLN/GBP 17.04.2026",
          "Źródło artykułu: Money.pl",
          "Kurs funta szterlinga",
          "Kurs funta szterlinga 17.04.2026 - godz.19:28",
          "Kurs funta szterlinga - 17.04.2026. W piątek wieczorem za jednego funta brytyjskiego trzeba zapłacić 4.85690 zł.",
          "wobec złotego: 4.85690",
        ],
        "Ile kosztuje funt? Kurs funta do złotego PLN/GBP 17.04.2026",
      ),
    ).toEqual([
      "Kurs funta szterlinga - 17.04.2026. W piątek wieczorem za jednego funta brytyjskiego trzeba zapłacić 4.85690 zł.",
      "wobec złotego: 4.85690",
    ]);
  });
});
