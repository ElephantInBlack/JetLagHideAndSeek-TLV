import * as turf from "@turf/turf";
import type {
    Feature,
    FeatureCollection,
    MultiPolygon,
    Polygon,
} from "geojson";
import osmtogeojson from "osmtogeojson";

import { LOCATION_FIRST_TAG } from "@/maps/api/constants";

import { TEL_AVIV_DATA_MANIFEST } from "./manifest";
import type {
    CircleScope,
    LocalPlace,
    LocalPlaceCategory,
    OsmElement,
    OsmResponse,
    PlaceDataProvider,
    PlaceScope,
} from "./types";

const snapshotPromises = new Map<string, Promise<OsmResponse>>();
let boundaryPromise: Promise<FeatureCollection<Polygon | MultiPolygon>> | null =
    null;

const MUNICIPALITY_NAMES_HE: Record<number, string> = {
    1382494: "תל אביב-יפו",
    1382493: "רמת גן",
    1382923: "גבעתיים",
};

const POI_AREA_CONTEXT_HE: Record<string, string> = {
    "way/151643650": "ספארי רמת גן",
};

const GENERIC_HEBREW_POI_NAMES = new Set([
    "פינת ליטוף",
    "פינת חי",
    "גן החיות",
    "הספרייה",
    "ספרייה",
    "קולנוע",
    "סינמטק",
    "בית חולים",
    "מרכז רפואי",
]);

export const shortenHebrewPoiName = (name: string) =>
    name
        .replace(/\s+(?:ע["״׳']?ש|על שם)\s+.*$/u, "")
        .replace(/\s+/g, " ")
        .trim();

export const hebrewPoiNeedsContext = (name: string, count: number) =>
    count > 1 || GENERIC_HEBREW_POI_NAMES.has(name);

export const explicitHebrewPoiContext = (
    id: string,
    tags: Record<string, string>,
) => {
    const taggedArea =
        tags["addr:suburb"] ??
        tags["addr:neighbourhood"] ??
        tags["addr:street"];
    return (
        POI_AREA_CONTEXT_HE[id] ??
        (taggedArea && /[\u0590-\u05ff]/u.test(taggedArea)
            ? taggedArea.trim()
            : undefined)
    );
};

const dataUrl = (path: string) =>
    `${import.meta.env.BASE_URL}/${path}`.replace(/([^:]\/)\/+/g, "$1");

const loadSnapshot = (path: string): Promise<OsmResponse> => {
    const existing = snapshotPromises.get(path);
    if (existing) return existing;

    const promise = fetch(dataUrl(path)).then(async (response) => {
        if (!response.ok) {
            throw new Error(
                `Could not load local map data (${response.status})`,
            );
        }
        return (await response.json()) as OsmResponse;
    });
    snapshotPromises.set(path, promise);
    return promise;
};

export const categoriesForTags = (
    tags: Record<string, string>,
): LocalPlaceCategory[] => {
    const categories = new Set<LocalPlaceCategory>();

    if (
        ["disused", "abandoned", "demolished", "removed", "proposed"].some(
            (key) => tags[key] === "yes",
        ) ||
        tags.fixme?.toLowerCase().includes("not a real")
    ) {
        return [];
    }

    for (const [category, firstTag] of Object.entries(LOCATION_FIRST_TAG)) {
        if (tags[firstTag] === category) {
            categories.add(category as LocalPlaceCategory);
        }
    }

    if (tags["brand:wikidata"] === "Q38076") categories.add("mcdonalds");
    if (tags["brand:wikidata"] === "Q259340") categories.add("seven11");
    if (tags.aeroway === "aerodrome" && tags.iata) categories.add("airport");
    if (tags.place === "city") categories.add("major-city");

    if (
        ["station", "halt", "stop", "tram_stop", "funicular"].includes(
            tags.railway,
        ) ||
        tags.highway === "bus_stop" ||
        tags.amenity === "ferry_terminal" ||
        (tags.public_transport === "platform" && tags.platform === "ferry") ||
        tags.aerialway === "station"
    ) {
        categories.add("station");
    }

    return [...categories];
};

export const normalizeElement = (element: OsmElement): LocalPlace | null => {
    const coordinates = element.center
        ? [element.center.lon, element.center.lat]
        : typeof element.lon === "number" && typeof element.lat === "number"
          ? [element.lon, element.lat]
          : null;
    if (!coordinates) return null;

    const tags = element.tags ?? {};
    const categories = categoriesForTags(tags);
    if (categories.length === 0) return null;

    const cleanName = (value?: string) => {
        const cleaned = value?.replace(/\s+/g, " ").trim();
        return cleaned && !["-", "yes", "no"].includes(cleaned.toLowerCase())
            ? cleaned
            : undefined;
    };
    const genericName = cleanName(tags.name);
    const nameEn = cleanName(tags["name:en"]);
    const nameHe =
        cleanName(tags["name:he"]) ??
        (genericName && /[\u0590-\u05ff]/u.test(genericName)
            ? genericName
            : undefined);
    const name = nameEn ?? genericName ?? nameHe;
    if (!name) return null;

    const displayName = nameHe ?? name;

    const id = `${element.type}/${element.id}`;
    return turf.point(coordinates, {
        id,
        osmType: element.type,
        osmId: element.id,
        name,
        displayName,
        nameEn,
        nameHe,
        categories,
        tags,
    });
};

const matchesStationFilter = (place: LocalPlace, filter: string) => {
    const clauses = [...filter.matchAll(/\[([^=!\]]+)(!?=)([^\]]+)\]/g)];
    return clauses.every(([, key, operator, rawValue]) => {
        const value = rawValue.replace(/^['"]|['"]$/g, "");
        return operator === "!="
            ? place.properties.tags[key] !== value
            : place.properties.tags[key] === value;
    });
};

const withinCircle = (place: LocalPlace, scope: CircleScope) =>
    turf.distance(turf.point([...scope.center]), place, {
        units: scope.unit,
    }) <= scope.radius;

const toPlaces = (responses: OsmResponse[]) => {
    const byId = new Map<string, LocalPlace>();
    for (const response of responses) {
        for (const element of response.elements) {
            const place = normalizeElement(element);
            if (place) byId.set(place.properties.id, place);
        }
    }
    return [...byId.values()];
};

const loadBoundaries = async () => {
    if (!boundaryPromise) {
        boundaryPromise = loadSnapshot(
            TEL_AVIV_DATA_MANIFEST.files.boundaries,
        ).then((data) => {
            const converted = osmtogeojson(data as any) as FeatureCollection;
            return turf.featureCollection(
                converted.features.filter(
                    (feature): feature is Feature<Polygon | MultiPolygon> =>
                        feature.geometry?.type === "Polygon" ||
                        feature.geometry?.type === "MultiPolygon",
                ),
            );
        });
    }
    return boundaryPromise;
};

const gameBoundary = async () => {
    const boundaries = await loadBoundaries();
    const selected = boundaries.features.filter((feature) => {
        const id = String(feature.id ?? "").replace(/^relation\//, "");
        return TEL_AVIV_DATA_MANIFEST.relationIds.includes(Number(id));
    });
    const source = selected.length > 0 ? selected : boundaries.features;
    const union = turf.union(turf.featureCollection(source));
    if (!union) throw new Error("The local municipal boundary is empty");
    return union;
};

const addHebrewPoiLabels = async (places: LocalPlace[]) => {
    const boundaries = await loadBoundaries();
    const municipalities = boundaries.features
        .map((feature) => {
            const id = Number(
                String(feature.id ?? "").replace(/^relation\//, ""),
            );
            return { feature, id, name: MUNICIPALITY_NAMES_HE[id] };
        })
        .filter(
            (entry): entry is typeof entry & { name: string } => !!entry.name,
        );
    const namedPlaces = places.filter((place) => place.properties.nameHe);
    const nameCounts = new Map<string, number>();
    namedPlaces.forEach((place) => {
        const name = shortenHebrewPoiName(place.properties.nameHe!);
        nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
    });

    return namedPlaces.map((place) => {
        const name = shortenHebrewPoiName(place.properties.nameHe!);
        const needsContext = hebrewPoiNeedsContext(
            name,
            nameCounts.get(name) ?? 0,
        );
        const municipality = needsContext
            ? municipalities.find(({ feature }) =>
                  turf.booleanPointInPolygon(place, feature),
              )?.name
            : undefined;
        const context = needsContext
            ? (explicitHebrewPoiContext(
                  place.properties.id,
                  place.properties.tags,
              ) ?? municipality)
            : undefined;

        return {
            ...place,
            properties: {
                ...place.properties,
                displayName:
                    context && !name.includes(context)
                        ? `${name} — ${context}`
                        : name,
            },
        };
    });
};

let gameBoundaryPromise: ReturnType<typeof gameBoundary> | null = null;

const categoryPlacePromises = new Map<
    LocalPlaceCategory,
    Promise<LocalPlace[]>
>();

const getPlacesForCategory = (category: LocalPlaceCategory) => {
    const existing = categoryPlacePromises.get(category);
    if (existing) return existing;

    const file =
        category === "station"
            ? TEL_AVIV_DATA_MANIFEST.files.stations
            : category === "airport" || category === "major-city"
              ? TEL_AVIV_DATA_MANIFEST.files.reference
              : TEL_AVIV_DATA_MANIFEST.files.places;
    const promise = loadSnapshot(file).then((response) =>
        toPlaces([response]).filter((place) =>
            place.properties.categories.includes(category),
        ),
    );
    categoryPlacePromises.set(category, promise);
    return promise;
};

export const localPlaceDataProvider: PlaceDataProvider = {
    async getPlaces(category: LocalPlaceCategory, scope?: PlaceScope) {
        let places = [...(await getPlacesForCategory(category))];

        if (scope && "center" in scope) {
            const [lng, lat] = scope.center;
            const latitudeDelta = turf.convertLength(
                scope.radius,
                scope.unit,
                "degrees",
            );
            const longitudeDelta =
                latitudeDelta / Math.cos((lat * Math.PI) / 180);
            places = places.filter((place) => {
                const [placeLng, placeLat] = place.geometry.coordinates;
                return (
                    Math.abs(placeLng - lng) <= longitudeDelta &&
                    Math.abs(placeLat - lat) <= latitudeDelta &&
                    withinCircle(place, scope)
                );
            });
        }

        if (scope && "gameArea" in scope && scope.gameArea) {
            gameBoundaryPromise ??= gameBoundary();
            const boundary = await gameBoundaryPromise;
            places = places.filter((place) =>
                turf.booleanPointInPolygon(place, boundary),
            );
        }

        if (scope && "hebrewPoiLabels" in scope && scope.hebrewPoiLabels) {
            places = await addHebrewPoiLabels(places);
        }

        return turf.featureCollection(places);
    },

    async getNearest(category, point) {
        const places = await this.getPlaces(category);
        if (places.features.length === 0) return null;
        return turf.nearestPoint(
            turf.point([...point]),
            places,
        ) as unknown as LocalPlace;
    },

    async getStations(filters) {
        const stations = await this.getPlaces("station", { gameArea: true });
        if (filters.length === 0) return stations;
        return turf.featureCollection(
            stations.features.filter((place) =>
                filters.some((filter) => matchesStationFilter(place, filter)),
            ),
        );
    },

    async getBoundary(id) {
        const boundaries = await loadBoundaries();
        return (
            boundaries.features.find((feature) => {
                const featureId = String(feature.id ?? "").replace(
                    /^relation\//,
                    "",
                );
                return Number(featureId) === id;
            }) ?? null
        );
    },

    async getGameBoundary() {
        gameBoundaryPromise ??= gameBoundary();
        return gameBoundaryPromise;
    },

    canAnswerCircle(scope) {
        const centerDistanceMeters = turf.distance(
            turf.point([...TEL_AVIV_DATA_MANIFEST.coverage.center]),
            turf.point([...scope.center]),
            { units: "meters" },
        );
        const radiusMeters = turf.convertLength(
            scope.radius,
            scope.unit,
            "meters",
        );
        return (
            centerDistanceMeters + radiusMeters <=
            TEL_AVIV_DATA_MANIFEST.coverage.radiusMeters
        );
    },
};

export const localPlacesToOverpass = (places: LocalPlace[]): OsmResponse => ({
    elements: places.map((place) => ({
        type: place.properties.osmType,
        id: place.properties.osmId,
        lat: place.geometry.coordinates[1],
        lon: place.geometry.coordinates[0],
        tags: {
            ...place.properties.tags,
            name: place.properties.nameHe ?? place.properties.name,
            "name:en": place.properties.nameEn ?? place.properties.name,
        },
    })),
});

export const resetLocalDataCachesForTests = () => {
    snapshotPromises.clear();
    categoryPlacePromises.clear();
    boundaryPromise = null;
    gameBoundaryPromise = null;
};
