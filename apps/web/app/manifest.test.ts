import { describe, expect, it } from "vitest";

import manifest from "@/app/manifest";

describe("manifest", () => {
  it("keeps the capture share target inside app scope", () => {
    const definition = manifest();

    expect(definition.scope).toBe("/");
    expect(definition.start_url).toBe("/read/inbox");
    expect(definition.share_target?.action).toBe("/capture");
  });
});
