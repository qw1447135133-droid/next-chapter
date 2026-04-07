import { createAccumulatedTextDeltaForwarder } from "./streaming-delta";

describe("createAccumulatedTextDeltaForwarder", () => {
  it("emits only the newly appended delta", () => {
    const chunks: string[] = [];
    const forward = createAccumulatedTextDeltaForwarder((delta) => chunks.push(delta));

    forward("你");
    forward("你好");
    forward("你好，世");
    forward("你好，世界");

    expect(chunks).toEqual(["你", "好", "，世", "界"]);
  });

  it("falls back safely when the upstream text resets", () => {
    const chunks: string[] = [];
    const forward = createAccumulatedTextDeltaForwarder((delta) => chunks.push(delta));

    forward("alpha");
    forward("alpha beta");
    forward("reset");

    expect(chunks).toEqual(["alpha", " beta", "reset"]);
  });
});
