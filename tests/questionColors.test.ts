import { expect, test } from "vitest";

import { pickUnusedQuestionColor } from "@/maps/questionColors";

test("new questions keep their color unless it is already used", () => {
    expect(pickUnusedQuestionColor("red", new Set(["blue"]))).toBe("red");
    expect(pickUnusedQuestionColor("red", new Set(["red"]))).not.toBe("red");
});
