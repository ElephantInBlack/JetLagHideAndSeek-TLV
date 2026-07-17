import { readFile } from "node:fs/promises";
import path from "node:path";

import * as turf from "@turf/turf";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
    localPlaceDataProvider,
    normalizeElement,
    resetLocalDataCachesForTests,
} from "@/maps/data";

const fetchSnapshot = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const relativePath = url
        .replace(/^https?:\/\/[^/]+\//, "")
        .replace(/^\//, "");
    const contents = await readFile(
        path.join(process.cwd(), "public", relativePath),
    );
    return new Response(contents, {
        headers: { "content-type": "application/json" },
    });
});

beforeAll(() => {
    vi.stubGlobal("fetch", fetchSnapshot);
});

afterAll(() => {
    vi.unstubAllGlobals();
});

describe("Tel Aviv local place data", () => {
    it("keeps stable OSM identity and both Hebrew and English names", () => {
        const first = normalizeElement({
            type: "node",
            id: 101,
            lat: 32.08,
            lon: 34.78,
            tags: {
                tourism: "museum",
                name: "מוזיאון הדוגמה",
                "name:en": "Example Museum",
            },
        });
        const second = normalizeElement({
            type: "way",
            id: 202,
            center: { lat: 32.08, lon: 34.78 },
            tags: {
                tourism: "museum",
                name: "מוזיאון הדוגמה",
            },
        });

        expect(first?.properties).toMatchObject({
            id: "node/101",
            name: "Example Museum",
            displayName: "מוזיאון הדוגמה",
            nameEn: "Example Museum",
            nameHe: "מוזיאון הדוגמה",
        });
        expect(second?.properties.id).toBe("way/202");
        expect(second?.properties.id).not.toBe(first?.properties.id);
    });

    it("drops unnamed POIs instead of exposing raw OSM IDs", () => {
        expect(
            normalizeElement({
                type: "node",
                id: 303,
                lat: 32.08,
                lon: 34.78,
                tags: { tourism: "museum" },
            }),
        ).toBeNull();
    });

    it("drops inactive POIs", () => {
        expect(
            normalizeElement({
                type: "node",
                id: 304,
                lat: 32.08,
                lon: 34.78,
                tags: {
                    tourism: "museum",
                    name: "Closed museum",
                    disused: "yes",
                },
            }),
        ).toBeNull();
    });

    it("filters by bounding box and exact distance and caches the category", async () => {
        resetLocalDataCachesForTests();
        fetchSnapshot.mockClear();
        const allMuseums = await localPlaceDataProvider.getPlaces("museum");
        expect(allMuseums.features.length).toBeGreaterThan(0);

        const center = allMuseums.features[0].geometry.coordinates as [
            number,
            number,
        ];
        const nearby = await localPlaceDataProvider.getPlaces("museum", {
            center,
            radius: 1,
            unit: "miles",
        });

        expect(nearby.features.length).toBeGreaterThan(0);
        expect(
            nearby.features.every(
                (place) =>
                    turf.distance(turf.point(center), place, {
                        units: "miles",
                    }) <= 1,
            ),
        ).toBe(true);
        expect(fetchSnapshot).toHaveBeenCalledTimes(1);
    });

    it("combines circle and municipal-boundary filtering", async () => {
        const places = await localPlaceDataProvider.getPlaces("museum", {
            center: [34.81, 32.075],
            radius: 15,
            unit: "miles",
            gameArea: true,
            hebrewPoiLabels: true,
        });
        const boundary = await localPlaceDataProvider.getGameBoundary();

        expect(places.features.length).toBeGreaterThan(0);
        expect(
            places.features.every((place) =>
                turf.booleanPointInPolygon(place, boundary),
            ),
        ).toBe(true);
        expect(
            places.features.every(
                (place) =>
                    !!place.properties.nameHe &&
                    !/[A-Za-z]/u.test(place.properties.displayName),
            ),
        ).toBe(true);
    });

    it("keeps unique names short and adds local context only when needed", async () => {
        const scope = {
            center: [34.81, 32.075] as const,
            radius: 15,
            unit: "miles" as const,
            gameArea: true as const,
            hebrewPoiLabels: true as const,
        };
        const themeParks = await localPlaceDataProvider.getPlaces(
            "theme_park",
            scope,
        );
        const zoos = await localPlaceDataProvider.getPlaces("zoo", scope);

        expect(
            themeParks.features.map((place) => place.properties.displayName),
        ).toEqual(expect.arrayContaining(["לונה פארק", "מימדיון"]));
        expect(
            zoos.features.find(
                (place) => place.properties.id === "way/151643650",
            )?.properties.displayName,
        ).toBe("פינת ליטוף — ספארי רמת גן");
        expect(
            zoos.features.find(
                (place) => place.properties.id === "way/98259532",
            )?.properties.displayName,
        ).toBe("הגן למחקר זואולוגי");
        expect(
            zoos.features.some(
                (place) => place.properties.id === "way/232898381",
            ),
        ).toBe(false);
    });

    it("finds the nearest local point without another request", async () => {
        const museums = await localPlaceDataProvider.getPlaces("museum");
        const target = museums.features[0];
        fetchSnapshot.mockClear();

        const nearest = await localPlaceDataProvider.getNearest(
            "museum",
            target.geometry.coordinates as [number, number],
        );

        expect(nearest?.properties.id).toBe(target.properties.id);
        expect(fetchSnapshot).not.toHaveBeenCalled();
    });

    it("loads the fixed municipal boundaries and enforces snapshot coverage", async () => {
        resetLocalDataCachesForTests();
        const boundary = await localPlaceDataProvider.getBoundary(1382494);
        expect(boundary).not.toBeNull();

        expect(
            localPlaceDataProvider.canAnswerCircle({
                center: [34.81, 32.075],
                radius: 15,
                unit: "miles",
            }),
        ).toBe(true);
        expect(
            localPlaceDataProvider.canAnswerCircle({
                center: [34.81, 32.075],
                radius: 30,
                unit: "miles",
            }),
        ).toBe(false);
    });
});
