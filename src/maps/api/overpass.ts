import * as turf from "@turf/turf";
import type { FeatureCollection, MultiPolygon } from "geojson";
import _ from "lodash";
import osmtogeojson from "osmtogeojson";
import { toast } from "react-toastify";

import {
    additionalMapGeoLocations,
    mapGeoLocation,
    overpassCustomHost,
    overpassHost,
    polyGeoJSON,
} from "@/lib/context";
import {
    explicitHebrewPoiContext,
    hebrewPoiNeedsContext,
    type LocalPlaceCategory,
    localPlaceDataProvider,
    localPlacesToOverpass,
    shortenHebrewPoiName,
    TEL_AVIV_DATA_MANIFEST,
} from "@/maps/data";
import { safeUnion, setGameAreaMask } from "@/maps/geo-utils";

import { cacheFetch, determineCache } from "./cache";
import { LOCATION_FIRST_TAG, OVERPASS_HOSTS } from "./constants";
import type {
    EncompassingTentacleQuestionSchema,
    HomeGameMatchingQuestions,
    HomeGameMeasuringQuestions,
    QuestionSpecificLocation,
} from "./types";
import { CacheType } from "./types";

export const getOverpassData = async (
    query: string,
    loadingText?: string,
    cacheType: CacheType = CacheType.CACHE,
) => {
    const encodedQuery = encodeURIComponent(query);
    const allHostUrls = Object.values(OVERPASS_HOSTS);
    const selectedHost = overpassHost.get();
    const customUrl = overpassCustomHost.get();

    const primaryBaseUrl =
        selectedHost === "custom"
            ? customUrl || allHostUrls[0]
            : selectedHost || allHostUrls[0];
    const fallbackBaseUrls = allHostUrls.filter((h) => h !== primaryBaseUrl);

    const primaryUrl = `${primaryBaseUrl}?data=${encodedQuery}`;
    let response = await cacheFetch(primaryUrl, loadingText, cacheType);

    if (!response.ok) {
        for (const fallbackBase of fallbackBaseUrls) {
            try {
                const fallbackResponse = await cacheFetch(
                    `${fallbackBase}?data=${encodedQuery}`,
                    loadingText,
                    cacheType,
                );
                if (fallbackResponse.ok) {
                    const cache = await determineCache(cacheType);
                    await cache.put(primaryUrl, fallbackResponse.clone());
                    response = fallbackResponse;
                    break;
                }
            } catch {
                toast.error(
                    `Could not load data from Overpass: ${response.status} ${response.statusText}`,
                    { toastId: "overpass-error" },
                );
                return { elements: [] };
            }
        }
    }

    if (!response.ok) {
        toast.error(
            `Could not load data from Overpass: ${response.status} ${response.statusText}`,
            { toastId: "overpass-error" },
        );
        return { elements: [] };
    }

    const data = await response.json();
    return data;
};

export const determineGeoJSON = async (
    osmId: string,
    osmTypeLetter: "W" | "R" | "N",
): Promise<any> => {
    if (osmTypeLetter === "R") {
        const localBoundary = await localPlaceDataProvider.getBoundary(
            Number(osmId),
        );
        if (localBoundary) {
            return turf.featureCollection([localBoundary]);
        }
    }
    const osmTypeMap: { [key: string]: string } = {
        W: "way",
        R: "relation",
        N: "node",
    };
    const osmType = osmTypeMap[osmTypeLetter];
    const query = `[out:json];${osmType}(${osmId});out geom;`;
    const data = await getOverpassData(
        query,
        "Loading map data...",
        CacheType.PERMANENT_CACHE,
    );
    const geo = osmtogeojson(data);
    return {
        ...geo,
        features: geo.features.filter(
            (feature: any) => feature.geometry.type !== "Point",
        ),
    };
};

export const findTentacleLocations = async (
    question: EncompassingTentacleQuestionSchema,
    text: string = "Determining tentacle locations...",
) => {
    const scope = {
        center: [question.lng, question.lat] as const,
        radius: question.radius,
        unit: question.unit,
        gameArea: true as const,
        hebrewPoiLabels: true as const,
    };
    if (localPlaceDataProvider.canAnswerCircle(scope)) {
        return localPlaceDataProvider.getPlaces(question.locationType, scope);
    }

    toast.info(
        "This radius extends beyond the bundled Tel Aviv data; using Overpass for this question.",
        { toastId: "local-data-coverage" },
    );
    const query = `
[out:json][timeout:25];
nwr["${LOCATION_FIRST_TAG[question.locationType]}"="${question.locationType}"](around:${turf.convertLength(
        question.radius,
        question.unit,
        "meters",
    )}, ${question.lat}, ${question.lng});
out center;
    `;
    const data = await getOverpassData(query, text);
    const elements = data.elements;
    const response = turf.points([]);
    const hebrewNameForElement = (element: any) => {
        const genericName = element.tags.name?.trim();
        const name =
            element.tags["name:he"]?.trim() ??
            (genericName && /[\u0590-\u05ff]/u.test(genericName)
                ? genericName
                : undefined);
        return name ? shortenHebrewPoiName(name) : undefined;
    };
    const nameCounts = new Map<string, number>();
    elements.forEach((element: any) => {
        const name = hebrewNameForElement(element);
        if (name) nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
    });

    elements.forEach((element: any) => {
        const nameHe = hebrewNameForElement(element);
        if (!nameHe) return;

        const coordinates =
            typeof element.lat === "number" && typeof element.lon === "number"
                ? [element.lon, element.lat]
                : element.center &&
                    typeof element.center.lat === "number" &&
                    typeof element.center.lon === "number"
                  ? [element.center.lon, element.center.lat]
                  : null;
        if (!coordinates) return;

        const id = `${element.type}/${element.id}`;
        const possibleCityContext =
            element.tags["object:city"] ?? element.tags["addr:city"];
        const cityContext =
            possibleCityContext && /[\u0590-\u05ff]/u.test(possibleCityContext)
                ? possibleCityContext.trim()
                : undefined;
        const context =
            explicitHebrewPoiContext(id, element.tags) ?? cityContext;
        const displayName =
            hebrewPoiNeedsContext(nameHe, nameCounts.get(nameHe) ?? 0) &&
            context &&
            !nameHe.includes(context)
                ? `${nameHe} — ${context}`
                : nameHe;

        response.features.push(
            turf.point(coordinates, {
                id,
                name: nameHe,
                nameHe,
                nameEn: element.tags["name:en"]?.trim(),
                displayName,
            }),
        );
    });
    const gameBoundary = await localPlaceDataProvider.getGameBoundary();
    return turf.featureCollection(
        response.features.filter((place) =>
            turf.booleanPointInPolygon(place, gameBoundary),
        ),
    );
};

export const findAdminBoundary = async (
    latitude: number,
    longitude: number,
    adminLevel: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10,
) => {
    if (adminLevel === 8) {
        const point = turf.point([longitude, latitude]);
        for (const relationId of TEL_AVIV_DATA_MANIFEST.relationIds) {
            const boundary =
                await localPlaceDataProvider.getBoundary(relationId);
            if (boundary && turf.booleanPointInPolygon(point, boundary)) {
                return boundary;
            }
        }
    }

    const query = `
[out:json];
is_in(${latitude}, ${longitude})->.a;
rel(pivot.a)["admin_level"="${adminLevel}"];
out geom;
    `;
    const data = await getOverpassData(query, "Determining matching zone...");
    const geo = osmtogeojson(data);
    return geo.features?.[0];
};

export const fetchCoastline = async () => {
    const response = await cacheFetch(
        import.meta.env.BASE_URL + "/data/tel-aviv/coastline.geojson",
        "Fetching coastline data...",
        CacheType.PERMANENT_CACHE,
    );
    const data = await response.json();
    return data;
};

export const trainLineNodeFinder = async (node: string): Promise<number[]> => {
    const nodeId = node.split("/")[1];
    const tagQuery = `
[out:json];
node(${nodeId});
wr(bn);
out tags;
`;
    const tagData = await getOverpassData(tagQuery, "Finding train line...");
    const query = `
[out:json];
(
${tagData.elements
    .map((element: any) => {
        if (
            !element.tags.name &&
            !element.tags["name:en"] &&
            !element.tags.network
        )
            return "";
        let query = "";
        if (element.tags.name) query += `wr["name"="${element.tags.name}"];`;
        if (element.tags["name:en"])
            query += `wr["name:en"="${element.tags["name:en"]}"];`;
        if (element.tags["network"])
            query += `wr["network"="${element.tags["network"]}"];`;
        return query;
    })
    .join("\n")}
);
out geom;
`;
    const data = await getOverpassData(query, "Finding train lines...");
    const geoJSON = osmtogeojson(data);
    const nodes: number[] = [];
    geoJSON.features.forEach((feature: any) => {
        if (feature && feature.id && feature.id.startsWith("node")) {
            nodes.push(parseInt(feature.id.split("/")[1]));
        }
    });
    data.elements.forEach((element: any) => {
        if (element && element.type === "node") {
            nodes.push(element.id);
        } else if (element && element.type === "way") {
            nodes.push(...element.nodes);
        }
    });
    const uniqNodes = _.uniq(nodes);
    return uniqNodes;
};

export const findPlacesInZone = async (
    filter: string,
    loadingText?: string,
    searchType:
        | "node"
        | "way"
        | "relation"
        | "nwr"
        | "nw"
        | "wr"
        | "nr"
        | "area" = "nwr",
    outType: "center" | "geom" = "center",
    alternatives: string[] = [],
    timeoutDuration: number = 0,
) => {
    const localFilters = [filter, ...alternatives];
    const isStationFilter = (candidate: string) =>
        /\[(railway|highway|public_transport|platform|aerialway)=/.test(
            candidate,
        ) || /\[amenity=ferry_terminal\]/.test(candidate);
    if (localFilters.every(isStationFilter)) {
        const stations = await localPlaceDataProvider.getStations(localFilters);
        return localPlacesToOverpass(stations.features);
    }

    const determineLocalCategory = (
        candidate: string,
    ): LocalPlaceCategory | null => {
        if (/brand:wikidata[^\]]*Q38076/.test(candidate)) return "mcdonalds";
        if (/brand:wikidata[^\]]*Q259340/.test(candidate)) return "seven11";
        if (/aeroway[^\]]*aerodrome/.test(candidate) && /iata/.test(candidate))
            return "airport";
        if (/place[^\]]*city/.test(candidate)) return "major-city";

        for (const [category, firstTag] of Object.entries(LOCATION_FIRST_TAG)) {
            const expression = new RegExp(
                `${firstTag}["']?\\s*=\\s*["']?${category}`,
            );
            if (expression.test(candidate)) {
                return category as LocalPlaceCategory;
            }
        }
        return null;
    };

    if (localFilters.length === 1) {
        const category = determineLocalCategory(filter);
        if (category) {
            const places = await localPlaceDataProvider.getPlaces(category, {
                gameArea: true,
            });
            return localPlacesToOverpass(places.features);
        }
    }

    let query = "";
    const $polyGeoJSON = polyGeoJSON.get();
    if ($polyGeoJSON) {
        query = `
[out:json]${timeoutDuration != 0 ? `[timeout:${timeoutDuration}]` : ""};
(
${searchType}${filter}(poly:"${turf
            .getCoords($polyGeoJSON.features)
            .flatMap((polygon) => polygon.geometry.coordinates)
            .flat()
            .map((coord) => [coord[1], coord[0]].join(" "))
            .join(" ")}");
${
    alternatives.length > 0
        ? alternatives
              .map(
                  (alternative) =>
                      `${searchType}${alternative}(poly:"${turf
                          .getCoords($polyGeoJSON.features)
                          .flatMap((polygon) => polygon.geometry.coordinates)
                          .flat()
                          .map((coord) => [coord[1], coord[0]].join(" "))
                          .join(" ")}");`,
              )
              .join("\n")
        : ""
}
);
out ${outType};
`;
    } else {
        const primaryLocation = mapGeoLocation.get();
        const additionalLocations = additionalMapGeoLocations
            .get()
            .filter((entry) => entry.added)
            .map((entry) => entry.location);
        const allLocations = [primaryLocation, ...additionalLocations];
        const relationToAreaBlocks = allLocations
            .map((loc, idx) => {
                const regionVar = `.region${idx}`;
                return `relation(${loc.properties.osm_id});map_to_area->${regionVar};`;
            })
            .join("\n");
        const searchBlocks = allLocations
            .map((_, idx) => {
                const regionVar = `area.region${idx}`;
                const altQueries =
                    alternatives.length > 0
                        ? alternatives
                              .map(
                                  (alt) => `${searchType}${alt}(${regionVar});`,
                              )
                              .join("\n")
                        : "";
                return `
            ${searchType}${filter}(${regionVar});
            ${altQueries}
          `;
            })
            .join("\n");
        query = `
        [out:json]${timeoutDuration !== 0 ? `[timeout:${timeoutDuration}]` : ""};
        ${relationToAreaBlocks}
        (
        ${searchBlocks}
        );
        out ${outType};
        `;
    }
    const data = await getOverpassData(
        query,
        loadingText,
        CacheType.ZONE_CACHE,
    );
    const subtractedEntries = additionalMapGeoLocations
        .get()
        .filter((e) => !e.added);
    const subtractedPolygons = subtractedEntries.map((entry) => entry.location);
    if (subtractedPolygons.length > 0 && data && data.elements) {
        const turfPolys = await Promise.all(
            subtractedPolygons.map(
                async (location) =>
                    turf.combine(
                        await determineGeoJSON(
                            location.properties.osm_id.toString(),
                            location.properties.osm_type,
                        ),
                    ).features[0],
            ),
        );
        data.elements = data.elements.filter((el: any) => {
            const lon = el.center ? el.center.lon : el.lon;
            const lat = el.center ? el.center.lat : el.lat;
            if (typeof lon !== "number" || typeof lat !== "number")
                return false;
            const pt = turf.point([lon, lat]);
            return !turfPolys.some((poly) =>
                turf.booleanPointInPolygon(pt, poly as any),
            );
        });
    }
    return data;
};

export const findPlacesSpecificInZone = async (
    location: `${QuestionSpecificLocation}`,
) => {
    const locations = (
        await findPlacesInZone(
            location,
            `Finding ${
                location === '["brand:wikidata"="Q38076"]'
                    ? "McDonald's"
                    : "7-Elevens"
            }...`,
        )
    ).elements;
    return turf.featureCollection(
        locations.map((x: any) =>
            turf.point([
                x.center ? x.center.lon : x.lon,
                x.center ? x.center.lat : x.lat,
            ]),
        ),
    );
};

export const nearestToQuestion = async (
    question: HomeGameMatchingQuestions | HomeGameMeasuringQuestions,
) => {
    const localNearest = await localPlaceDataProvider.getNearest(
        question.type,
        [question.lng, question.lat],
    );
    if (localNearest) {
        return turf.nearestPoint(
            turf.point([question.lng, question.lat]),
            turf.featureCollection([localNearest]),
        );
    }

    let radius = 30;
    let instances: any = { features: [] };
    const maxAttempts = 6;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        instances = await findTentacleLocations(
            {
                lat: question.lat,
                lng: question.lng,
                radius: radius,
                unit: "miles",
                location: false,
                locationType: question.type,
                drag: false,
                color: "black",
                collapsed: false,
                hidden: false,
            },
            "Finding matching locations...",
        );
        radius += 30;
        if (instances.features.length > 0) break;
    }
    if (instances.features.length === 0) {
        throw new Error(
            `No ${question.type} location found after ${maxAttempts} bounded searches`,
        );
    }
    const questionPoint = turf.point([question.lng, question.lat]);
    return turf.nearestPoint(questionPoint, instances as any);
};

export const determineMapBoundaries = async () => {
    const localBoundary = await localPlaceDataProvider.getGameBoundary();
    setGameAreaMask(localBoundary);
    return turf.combine(
        turf.featureCollection([localBoundary]),
    ) as FeatureCollection<MultiPolygon>;

    /* Global-region fallback retained below for future upstream compatibility. */
    const mapGeoDatum = await Promise.all(
        [
            {
                location: mapGeoLocation.get(),
                added: true,
                base: true,
            },
            ...additionalMapGeoLocations.get(),
        ].map(async (location) => ({
            added: location.added,
            data: await determineGeoJSON(
                location.location.properties.osm_id.toString(),
                location.location.properties.osm_type,
            ),
        })),
    );

    let mapGeoData = turf.featureCollection([
        safeUnion(
            turf.featureCollection(
                mapGeoDatum
                    .filter((x) => x.added)
                    .flatMap((x) => x.data.features),
            ) as any,
        ),
    ]);

    const differences = mapGeoDatum.filter((x) => !x.added).map((x) => x.data);

    if (differences.length > 0) {
        mapGeoData = turf.featureCollection([
            turf.difference(
                turf.featureCollection([
                    mapGeoData.features[0],
                    ...differences.flatMap((x) => x.features),
                ]),
            )!,
        ]);
    }

    if (turf.coordAll(mapGeoData).length > 10000) {
        turf.simplify(mapGeoData, {
            tolerance: 0.0005,
            highQuality: true,
            mutate: true,
        });
    }

    return turf.combine(mapGeoData) as FeatureCollection<MultiPolygon>;
};
