import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOME_AGENT_TEXT_MODEL_KEY,
  getHomeAgentTextModelOption,
  groupHomeAgentTextModelOptions,
  normalizeHomeAgentTextModelKey,
} from "./text-models";

describe("home-agent text models", () => {
  it("groups text models by supplier and family", () => {
    const groups = groupHomeAgentTextModelOptions();
    expect(groups.length).toBeGreaterThan(1);
    expect(groups[0]?.supplierLabel).toBeTruthy();
    expect(groups[0]?.familyLabel).toBeTruthy();
    expect(groups.every((group) => group.options.length > 0)).toBe(true);
  });

  it("normalizes invalid model keys back to the default", () => {
    expect(normalizeHomeAgentTextModelKey("not-a-real-model")).toBe(DEFAULT_HOME_AGENT_TEXT_MODEL_KEY);
  });

  it("returns a concrete option for a valid text model key", () => {
    const option = getHomeAgentTextModelOption("gpt-5.4");
    expect(option.provider).toBe("gpt");
    expect(option.shortLabel).toContain("5.4");
  });
});
