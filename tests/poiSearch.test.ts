import { expect, test } from "vitest";

import { matchesPoiSearch } from "@/maps/poiSearch";

const poi = {
    displayName: "פינת ליטוף — ספארי רמת גן",
    nameHe: "פינת ליטוף",
    nameEn: "Petting Zoo",
};

test("POI search matches Hebrew names, area context, and English aliases", () => {
    expect(matchesPoiSearch(poi, "ליטוף")).toBe(true);
    expect(matchesPoiSearch(poi, "ספארי")).toBe(true);
    expect(matchesPoiSearch(poi, "petting")).toBe(true);
    expect(matchesPoiSearch(poi, "מוזיאון")).toBe(false);
});
