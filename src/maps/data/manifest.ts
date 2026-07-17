import type { LocalDataManifest } from "./types";

export const TEL_AVIV_DATA_MANIFEST: LocalDataManifest = {
    version: 1,
    generatedAt: "2026-07-15",
    source: "OpenStreetMap",
    attribution: "© OpenStreetMap contributors, ODbL 1.0",
    relationIds: [1382494, 1382493, 1382923],
    coverage: {
        center: [34.81, 32.075],
        radiusMeters: 45000,
        guaranteedTentacleRadiusMiles: 15,
    },
    files: {
        boundaries: "data/tel-aviv/boundaries.osm.json",
        places: "data/tel-aviv/places.osm.json",
        stations: "data/tel-aviv/stations.osm.json",
        reference: "data/tel-aviv/reference.osm.json",
        coastline: "data/tel-aviv/coastline.geojson",
    },
};
