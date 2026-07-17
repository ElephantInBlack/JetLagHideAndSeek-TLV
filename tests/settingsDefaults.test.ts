import { expect, test } from "vitest";

import { followMe } from "@/lib/context";

test("the current-location map pin is off by default", () => {
    expect(followMe.get()).toBe(false);
});
