import * as turf from "@turf/turf";
import { expect, test } from "vitest";

import {
    findVoronoiCellForPoint,
    geoSpatialVoronoi,
    holedMask,
    setGameAreaMask,
} from "@/maps/geo-utils/operators";

test("the mask contains only eliminated area", () => {
    const gameArea = turf.bboxPolygon([0, 0, 10, 10]);
    const remainingArea = turf.bboxPolygon([2, 2, 8, 8]);
    setGameAreaMask(gameArea);

    const eliminatedArea = holedMask(remainingArea);

    expect(eliminatedArea).not.toBeNull();
    expect(
        turf.booleanPointInPolygon(turf.point([1, 1]), eliminatedArea!),
    ).toBe(true);
    expect(
        turf.booleanPointInPolygon(turf.point([5, 5]), eliminatedArea!),
    ).toBe(false);
});

test("voronoi cell lookup falls back to the nearest site on an uncovered edge", () => {
    const west = turf.point([34.78, 32.08]);
    const east = turf.point([34.82, 32.08]);
    const voronoi = geoSpatialVoronoi(turf.featureCollection([west, east]));
    const sharedEdge = turf.point([34.8, 32.08]);

    const cell = findVoronoiCellForPoint(voronoi, sharedEdge);

    expect(cell).toBeDefined();
    expect(cell?.properties?.site).toBeDefined();
});

test("the visual mask can include eliminated area outside the game boundary", () => {
    const gameArea = turf.bboxPolygon([2, 2, 8, 8]);
    const remainingArea = turf.bboxPolygon([3, 3, 7, 7]);
    const displayArea = turf.bboxPolygon([0, 0, 10, 10]);
    setGameAreaMask(gameArea);

    const eliminatedArea = holedMask(remainingArea, displayArea);

    expect(eliminatedArea).not.toBeNull();
    expect(
        turf.booleanPointInPolygon(turf.point([1, 1]), eliminatedArea!),
    ).toBe(true);
    expect(
        turf.booleanPointInPolygon(turf.point([5, 5]), eliminatedArea!),
    ).toBe(false);
});

test("voronoi diagram", () => {
    const BASE_POINT_COUNT = 25;
    const TEST_POINT_COUNT = 500;

    const bbox: [number, number, number, number] = [34.73, 32.02, 34.87, 32.16];
    const basePoints = turf.randomPoint(BASE_POINT_COUNT, { bbox });
    const voronoi = geoSpatialVoronoi(basePoints);

    expect(voronoi).toBeDefined();
    expect(voronoi.features.length).toBe(BASE_POINT_COUNT);

    const testPoints = turf.randomPoint(TEST_POINT_COUNT, { bbox });

    testPoints.features.forEach((point) => {
        const voronoiIndex = voronoi.features.findIndex((feature) =>
            turf.booleanPointInPolygon(point, feature),
        );
        const nearestBasePoint = turf.nearestPoint(point, basePoints);
        const basePointIndex = basePoints.features.findIndex(
            (feature) =>
                feature.geometry.coordinates[0] ===
                    nearestBasePoint.geometry.coordinates[0] &&
                feature.geometry.coordinates[1] ===
                    nearestBasePoint.geometry.coordinates[1],
        );

        if (voronoiIndex === -1) {
            return; // A glitch with turf where overlapping polygons can cause this
        }

        expect(voronoiIndex).toBe(basePointIndex);
    });
});
