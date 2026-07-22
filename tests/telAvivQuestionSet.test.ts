import { expect, test } from "vitest";

import { questionSchema } from "@/maps/schema";
import {
    isTelAvivQuestionTypeAllowed,
    TEL_AVIV_MATCHING_TYPES,
    TEL_AVIV_MEASURING_TYPES,
    TEL_AVIV_TENTACLE_TYPES,
} from "@/maps/telAvivQuestionSet";

test("only spreadsheet Matching, Measuring, and Tentacles types are enabled", () => {
    expect(Object.keys(TEL_AVIV_MATCHING_TYPES)).toEqual([
        "transit-line",
        "street-path",
        "zone",
        "neighborhood",
        "landmass",
        "park-full",
        "museum-full",
        "cinema-full",
        "hospital-full",
        "library-full",
    ]);
    expect(Object.keys(TEL_AVIV_MEASURING_TYPES)).toEqual([
        "rail-measure",
        "coastline",
        "park-full",
        "museum-full",
        "library-full",
        "hospital-full",
    ]);
    expect(Object.keys(TEL_AVIV_TENTACLE_TYPES)).toEqual([
        "hospital",
        "library",
        "cinema",
        "museum",
    ]);

    expect(isTelAvivQuestionTypeAllowed("matching", "zoo-full")).toBe(false);
    expect(isTelAvivQuestionTypeAllowed("measuring", "airport")).toBe(false);
    expect(isTelAvivQuestionTypeAllowed("tentacles", "custom")).toBe(false);
    expect(isTelAvivQuestionTypeAllowed("radius")).toBe(true);
});

test("new specialized questions start on allowed local types", () => {
    const matching = questionSchema.parse({
        id: "matching",
        data: { lat: 32.08, lng: 34.8 },
    });
    const measuring = questionSchema.parse({
        id: "measuring",
        data: { lat: 32.08, lng: 34.8 },
    });
    const tentacles = questionSchema.parse({
        id: "tentacles",
        data: { lat: 32.08, lng: 34.8 },
    });

    expect(matching.data).toMatchObject({ type: "museum-full" });
    expect(measuring.data).toMatchObject({ type: "coastline" });
    expect(tentacles.data).toMatchObject({ locationType: "museum" });
});
