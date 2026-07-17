import { expect, test } from "vitest";

import {
    QUESTION_MARKER_SYMBOLS,
    questionMarkerColor,
} from "@/components/questionMarkerStyle";
import { ICON_COLORS } from "@/maps/api/constants";

test("question types use distinct marker symbols", () => {
    const symbols = Object.values(QUESTION_MARKER_SYMBOLS);
    expect(new Set(symbols).size).toBe(symbols.length);
});

test("marker colors exactly match question banner colors", () => {
    expect(questionMarkerColor("red")).toBe(ICON_COLORS.red);
    expect(questionMarkerColor("blue")).toBe(ICON_COLORS.blue);
});
