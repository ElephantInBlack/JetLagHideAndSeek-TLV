import { readFile } from "node:fs/promises";

import * as turf from "@turf/turf";
import { expect, test, vi } from "vitest";

import {
    asPointFeatureCollection,
    findLandmassBoundary,
    findNeighborhoodBoundary,
} from "@/maps/questions/matching";

test("POI Matching normalizes point arrays for the Voronoi engine", () => {
    const points = [
        turf.point([34.78, 32.08], { id: "museum/1" }),
        turf.point([34.82, 32.08], { id: "museum/2" }),
    ];

    const collection = asPointFeatureCollection(points);

    expect(collection.type).toBe("FeatureCollection");
    expect(collection.features).toEqual(points);
});

test("the entire area north of HaYarkon is one landmass", () => {
    const northwest = turf.point([34.78, 32.12]);
    const northeast = turf.point([34.84, 32.12]);
    const northwestRegion = findLandmassBoundary(northwest);
    const northeastRegion = findLandmassBoundary(northeast);

    expect(northwestRegion.geometry).toEqual(northeastRegion.geometry);
    expect(turf.booleanPointInPolygon(northwest, northwestRegion)).toBe(true);
    expect(turf.booleanPointInPolygon(northeast, northwestRegion)).toBe(true);
});

test("Ayalon splits only the landmass south of HaYarkon", () => {
    const southwest = turf.point([34.77, 32.07]);
    const southeast = turf.point([34.84, 32.07]);
    const westRegion = findLandmassBoundary(southwest);
    const eastRegion = findLandmassBoundary(southeast);

    expect(turf.booleanPointInPolygon(southwest, westRegion)).toBe(true);
    expect(turf.booleanPointInPolygon(southeast, westRegion)).toBe(false);
    expect(turf.booleanPointInPolygon(southeast, eastRegion)).toBe(true);
    expect(turf.booleanPointInPolygon(southwest, eastRegion)).toBe(false);
});

test("Neighborhood Matching uses stable local polygons", async () => {
    const loadFixture = async (name: string) =>
        JSON.parse(
            await readFile(
                new URL(`../public/data/tel-aviv/${name}`, import.meta.url),
                "utf8",
            ),
        );
    const [
        telAvivNeighborhoods,
        ramatGanNeighborhoods,
        givatayimNeighborhoods,
    ] = await Promise.all([
        loadFixture("neighborhoods-tel-aviv.geojson"),
        loadFixture("neighborhoods-ramat-gan.geojson"),
        loadFixture("neighborhoods-givatayim.geojson"),
    ]);
    const files = {
        "neighborhoods-tel-aviv.geojson": telAvivNeighborhoods,
        "neighborhoods-ramat-gan.geojson": ramatGanNeighborhoods,
        "neighborhoods-givatayim.geojson": givatayimNeighborhoods,
    };
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
            const entry = Object.entries(files).find(([name]) =>
                url.endsWith(name),
            );
            return {
                ok: Boolean(entry),
                status: entry ? 200 : 404,
                json: async () => entry?.[1],
            };
        }),
    );
    const neighborhoodCenter = turf.point([34.7805, 32.0805]);
    const nearbyPoint = turf.point([34.781, 32.081]);
    const distantPoint = turf.point([34.83, 32.11]);
    const region = await findNeighborhoodBoundary(neighborhoodCenter);

    expect(region).toBeDefined();
    expect(turf.booleanPointInPolygon(nearbyPoint, region!)).toBe(true);
    expect(turf.booleanPointInPolygon(distantPoint, region!)).toBe(false);
    vi.unstubAllGlobals();
});
