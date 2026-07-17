import * as turf from "@turf/turf";
import { expect, test, vi } from "vitest";

vi.mock("@/maps/api", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/maps/api")>();
    return {
        ...original,
        findTentacleLocations: vi.fn(),
    };
});

vi.mock("@/maps/geo-utils", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/maps/geo-utils")>();
    return {
        ...original,
        arcBuffer: vi.fn(async (geometry, distance, unit) =>
            turf.buffer(geometry.features[0], distance, { units: unit }),
        ),
    };
});

import {
    adjustPerTentacle,
    findNearestTentacleLocation,
} from "@/maps/questions/tentacles";

test("a moved custom Tentacles pin selects the nearest in-radius POI", async () => {
    const near = turf.point([34.801, 32.08], {
        id: "node/1",
        name: "קרוב",
    });
    const far = turf.point([34.82, 32.08], {
        id: "node/2",
        name: "רחוק",
    });

    const selected = await findNearestTentacleLocation({
        locationType: "custom",
        places: [far, near],
        lat: 32.08,
        lng: 34.8,
        radius: 2,
        unit: "miles",
    } as any);

    expect(selected).not.toBe(false);
    expect(selected && selected.properties.id).toBe("node/1");
});

test("a POI outside the question radius still shapes the nearest-place region", async () => {
    const selected = turf.point([0, 0], {
        id: "node/inside",
        name: "Inside",
    });
    const outsideCompetitor = turf.point([0.03, 0], {
        id: "node/outside",
        name: "Outside",
    });
    const mapData = turf.featureCollection([
        turf.bboxPolygon([-0.03, -0.03, 0.03, 0.03]),
    ]);

    const result = await adjustPerTentacle(
        {
            locationType: "custom",
            places: [selected, outsideCompetitor],
            location: selected,
            lat: 0,
            lng: 0,
            radius: 2,
            unit: "kilometers",
        } as any,
        mapData,
    );

    expect(turf.booleanPointInPolygon(turf.point([0.01, 0]), result!)).toBe(
        true,
    );
    expect(turf.booleanPointInPolygon(turf.point([0.017, 0]), result!)).toBe(
        false,
    );
});
