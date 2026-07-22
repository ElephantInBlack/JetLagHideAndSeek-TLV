import * as turf from "@turf/turf";
import type {
    Feature,
    FeatureCollection,
    MultiPolygon,
    Point,
    Polygon,
} from "geojson";
import _ from "lodash";
import osmtogeojson from "osmtogeojson";
import { toast } from "react-toastify";

import {
    hiderMode,
    mapGeoJSON,
    mapGeoLocation,
    polyGeoJSON,
} from "@/lib/context";
import {
    findAdminBoundary,
    findPlacesInZone,
    getOverpassData,
    nearestToQuestion,
    trainLineNodeFinder,
} from "@/maps/api";
import { localPlaceDataProvider } from "@/maps/data";
import { getNeighborhoodBoundary } from "@/maps/data/neighborhoods";
import {
    findVoronoiCellForPoint,
    geoSpatialVoronoi,
    holedMask,
    modifyMapData,
    safeUnion,
} from "@/maps/geo-utils";
import type {
    APILocations,
    HomeGameMatchingQuestions,
    MatchingQuestion,
} from "@/maps/schema";

const LOCAL_EXTENT: [number, number, number, number] = [34.6, 31.8, 35.1, 32.4];
// Simplified from OpenStreetMap road and waterway geometry. These local
// dividers keep Landmass deterministic without making an Overpass request.
const AYALON_DIVIDER: [number, number][] = [
    [34.780502, 32.040057],
    [34.783025, 32.043815],
    [34.78452, 32.050041],
    [34.784816, 32.054206],
    [34.786412, 32.059914],
    [34.790959, 32.065674],
    [34.793188, 32.072102],
    [34.795691, 32.077932],
    [34.79796, 32.081991],
    [34.798431, 32.085628],
    [34.801247, 32.092235],
    [34.801841, 32.096433],
    [34.803387, 32.101785],
];
const YARKON_DIVIDER: [number, number][] = [
    [34.7675, 32.1001],
    [34.775966, 32.103401],
    [34.777325, 32.098087],
    [34.779061, 32.096087],
    [34.784087, 32.096343],
    [34.788393, 32.09673],
    [34.796484, 32.098454],
    [34.799829, 32.100148],
    [34.80644, 32.099694],
    [34.810411, 32.096248],
    [34.81335, 32.095831],
    [34.815746, 32.098185],
    [34.818043, 32.097936],
    [34.819334, 32.096094],
    [34.820745, 32.097181],
    [34.8277, 32.1018],
    [34.8398, 32.1052],
    [34.8527, 32.107],
    [34.87, 32.11],
];

// Retained only as migration data for old saved questions. New Neighborhood
// Matching calculations use the polygon snapshots in data/neighborhoods.ts.
export const LEGACY_OSM_NEIGHBORHOOD_CENTERS: [number, number][] = [
    [34.8115181, 32.048033],
    [34.7872941, 32.114806],
    [34.8277194, 32.1113441],
    [34.7979184, 32.0526518],
    [34.7659998, 32.0414434],
    [34.8404085, 32.1186515],
    [34.7999338, 32.047914],
    [34.810021, 32.0527579],
    [34.8014993, 32.0523098],
    [34.7964554, 32.1190832],
    [34.7991803, 32.0759211],
    [34.8204751, 32.1151856],
    [34.8220517, 32.1192285],
    [34.8361806, 32.1225549],
    [34.82856, 32.1157562],
    [34.8308172, 32.1216951],
    [34.8172615, 32.050533],
    [34.8007526, 32.0681284],
    [34.8193693, 32.0562469],
    [34.7950946, 32.1088611],
    [34.8004491, 32.1267263],
    [34.7927135, 32.1193923],
    [34.807683, 32.0583441],
    [34.8366472, 32.1155735],
    [34.7909422, 32.0440526],
    [34.8179752, 32.0777065],
    [34.8434712, 32.1145035],
    [34.7767582, 32.0448396],
    [34.8195469, 32.0686516],
    [34.8253133, 32.1258394],
    [34.8037708, 32.075635],
    [34.7729823, 32.0517305],
    [34.8100563, 32.074032],
    [34.7569006, 32.0545129],
    [34.8126793, 32.0673352],
    [34.7646198, 32.0628382],
    [34.8053698, 32.0652413],
    [34.7902745, 32.1077551],
    [34.8080207, 32.0633253],
    [34.7634439, 32.0645839],
    [34.829975, 32.125477],
    [34.784908, 32.0706921],
    [34.7896426, 32.086852],
    [34.7866346, 32.0876031],
    [34.7891218, 32.0936079],
    [34.7876273, 32.0801403],
    [34.8036698, 32.0808251],
    [34.8288918, 32.072611],
    [34.8120305, 32.0624699],
    [34.8112931, 32.0712815],
    [34.8142011, 32.1120278],
    [34.817766, 32.1122543],
    [34.8415912, 32.0564642],
    [34.8068643, 32.1224552],
    [34.7509908, 32.0443395],
    [34.7533279, 32.0538174],
    [34.8340713, 32.1102311],
    [34.8113141, 32.0823307],
    [34.8226476, 32.0771293],
    [34.8161305, 32.0870265],
    [34.793301, 32.0587361],
    [34.806232, 32.0443795],
    [34.803686, 32.11344],
    [34.7896755, 32.0690846],
    [34.7966382, 32.0698569],
    [34.8236424, 32.1082546],
    [34.8305225, 32.066956],
    [34.8091296, 32.0778478],
    [34.7971018, 32.0461048],
    [34.8029755, 32.0582019],
    [34.8043334, 32.0668104],
    [34.7471534, 32.0373592],
    [34.816613, 32.0712146],
    [34.81576, 32.0520067],
    [34.8120484, 32.0892542],
    [34.8334888, 32.1275426],
    [34.8229026, 32.0814179],
    [34.7686176, 32.0471182],
    [34.8389887, 32.1088154],
    [34.7934245, 32.129981],
    [34.7627909, 32.0566577],
    [34.784587, 32.1007373],
    [34.817665, 32.0818904],
    [34.7972309, 32.048454],
    [34.7880987, 32.0512931],
    [34.8251045, 32.0669969],
    [34.8153828, 32.0617357],
    [34.8068322, 32.0855223],
    [34.8158693, 32.1197886],
    [34.8179533, 32.1224653],
    [34.8447686, 32.0468815],
    [34.8030585, 32.0627365],
    [34.8216551, 32.0723428],
    [34.7500939, 32.0451864],
];

export const findNeighborhoodBoundary = getNeighborhoodBoundary;

const dividerHalves = () => {
    const [minX, minY, maxX, maxY] = LOCAL_EXTENT;
    const west = turf.polygon([
        [
            [minX, minY],
            [AYALON_DIVIDER[0][0], minY],
            ...AYALON_DIVIDER,
            [AYALON_DIVIDER.at(-1)![0], maxY],
            [minX, maxY],
            [minX, minY],
        ],
    ]);
    const east = turf.polygon([
        [
            [AYALON_DIVIDER[0][0], minY],
            [maxX, minY],
            [maxX, maxY],
            [AYALON_DIVIDER.at(-1)![0], maxY],
            ...[...AYALON_DIVIDER].reverse(),
            [AYALON_DIVIDER[0][0], minY],
        ],
    ]);
    const south = turf.polygon([
        [
            [minX, minY],
            [maxX, minY],
            [maxX, YARKON_DIVIDER.at(-1)![1]],
            ...[...YARKON_DIVIDER].reverse(),
            [minX, YARKON_DIVIDER[0][1]],
            [minX, minY],
        ],
    ]);
    const north = turf.polygon([
        [
            [minX, YARKON_DIVIDER[0][1]],
            ...YARKON_DIVIDER,
            [maxX, YARKON_DIVIDER.at(-1)![1]],
            [maxX, maxY],
            [minX, maxY],
            [minX, YARKON_DIVIDER[0][1]],
        ],
    ]);
    return { west, east, south, north };
};

export const findLandmassBoundary = (point: Feature<Point>) => {
    const { west, east, south, north } = dividerHalves();
    if (turf.booleanPointInPolygon(point, north)) return north;

    const vertical = turf.booleanPointInPolygon(point, west) ? west : east;
    return turf.intersect(turf.featureCollection([vertical, south]));
};

export const asPointFeatureCollection = (data: unknown) => {
    if (
        data &&
        typeof data === "object" &&
        (data as FeatureCollection).type === "FeatureCollection"
    ) {
        return data as FeatureCollection<Point>;
    }
    return turf.featureCollection((data ?? []) as Feature<Point>[]);
};

const linearFeatures = (data: unknown) =>
    turf
        .flatten(osmtogeojson(data as any) as FeatureCollection)
        .features.filter(
            (feature) =>
                feature.geometry?.type === "LineString" ||
                feature.geometry?.type === "MultiLineString",
        );

const nearestLinearFeature = (point: Feature<Point>, features: Feature[]) =>
    features.reduce<Feature | null>((nearest, feature) => {
        if (!nearest) return feature;
        return turf.pointToLineDistance(point, feature as any, {
            units: "meters",
        }) <
            turf.pointToLineDistance(point, nearest as any, {
                units: "meters",
            })
            ? feature
            : nearest;
    }, null);

const bufferedLines = (features: Feature[], kilometers: number) => {
    const buffered = turf.buffer(turf.featureCollection(features), kilometers, {
        units: "kilometers",
    });
    return buffered ? safeUnion(buffered as any) : null;
};

const findStreetBoundary = async (lat: number, lng: number) => {
    const point = turf.point([lng, lat]);
    const nearby = await getOverpassData(
        `[out:json][timeout:25];way(around:100,${lat},${lng})[highway][name];out geom;`,
        "Finding the nearest street or path...",
    );
    const nearest = nearestLinearFeature(point, linearFeatures(nearby));
    const name = nearest?.properties?.tags?.name ?? nearest?.properties?.name;
    if (!name) throw new Error("No named street or path found nearby");

    const escapedName = String(name)
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"');
    const matchingWays = await findPlacesInZone(
        `[highway][name="${escapedName}"]`,
        `Loading ${name}...`,
        "way",
        "geom",
    );
    const boundary = bufferedLines(linearFeatures(matchingWays), 0.025);
    if (!boundary) throw new Error(`Could not build the ${name} street area`);
    return boundary;
};

const findTransitLineBoundary = async (lat: number, lng: number) => {
    const point = turf.point([lng, lat]);
    const nearby = await getOverpassData(
        `[out:json][timeout:25];relation(around:150,${lat},${lng})[route=bus];out geom;`,
        "Finding the bus line...",
    );
    const routes = linearFeatures(nearby);
    const nearest = nearestLinearFeature(point, routes);
    if (!nearest) throw new Error("No bus line found near this location");
    const routeId = nearest.id ?? nearest.properties?.id;
    const completeRoute = routeId
        ? routes.filter(
              (feature) => (feature.id ?? feature.properties?.id) === routeId,
          )
        : [nearest];
    const boundary = bufferedLines(completeRoute, 0.2);
    if (!boundary) throw new Error("Could not build the bus-line area");
    return boundary;
};

export const findMatchingPlaces = async (question: MatchingQuestion) => {
    switch (question.type) {
        case "airport": {
            return _.uniqBy(
                (
                    await findPlacesInZone(
                        '["aeroway"="aerodrome"]["iata"]', // Only commercial airports have IATA codes,
                        "Finding airports...",
                    )
                ).elements,
                (feature: any) => feature.tags.iata,
            ).map((x) =>
                turf.point([
                    x.center ? x.center.lon : x.lon,
                    x.center ? x.center.lat : x.lat,
                ]),
            );
        }
        case "major-city": {
            return (
                await findPlacesInZone(
                    '[place=city]["population"~"^[1-9]+[0-9]{6}$"]', // The regex is faster than (if:number(t["population"])>1000000)
                    "Finding cities...",
                )
            ).elements.map((x: any) =>
                turf.point([
                    x.center ? x.center.lon : x.lon,
                    x.center ? x.center.lat : x.lat,
                ]),
            );
        }
        case "custom-points": {
            return question.geo!;
        }
        case "aquarium-full":
        case "zoo-full":
        case "theme_park-full":
        case "peak-full":
        case "museum-full":
        case "hospital-full":
        case "cinema-full":
        case "library-full":
        case "golf_course-full":
        case "consulate-full":
        case "park-full": {
            const location = question.type.split("-full")[0] as APILocations;

            // Tel Aviv POIs are bundled with the app. Using the same local
            // snapshot as Tentacles keeps Matching deterministic and avoids a
            // separate Overpass request that can fail on GitHub Pages.
            return localPlaceDataProvider.getPlaces(location, {
                gameArea: true,
            });
        }
    }
};

export const determineMatchingBoundary = _.memoize(
    async (question: MatchingQuestion) => {
        let boundary;

        switch (question.type) {
            case "landmass": {
                boundary = findLandmassBoundary(
                    turf.point([question.lng, question.lat]),
                );
                break;
            }
            case "neighborhood": {
                boundary = await findNeighborhoodBoundary(
                    turf.point([question.lng, question.lat]),
                );
                if (!boundary) {
                    toast.error(
                        "No neighborhood region found at this location",
                    );
                    throw new Error("No neighborhood region found");
                }
                break;
            }
            case "street-path": {
                boundary = await findStreetBoundary(question.lat, question.lng);
                break;
            }
            case "transit-line": {
                boundary = await findTransitLineBoundary(
                    question.lat,
                    question.lng,
                );
                break;
            }
            case "aquarium":
            case "zoo":
            case "theme_park":
            case "peak":
            case "museum":
            case "hospital":
            case "cinema":
            case "library":
            case "golf_course":
            case "consulate":
            case "park":
            case "same-first-letter-station":
            case "same-length-station":
            case "same-train-line": {
                return false;
            }
            case "custom-zone": {
                boundary = question.geo;
                break;
            }
            case "zone": {
                boundary = await findAdminBoundary(
                    question.lat,
                    question.lng,
                    8,
                );

                if (!boundary) {
                    toast.error("No boundary found for this zone");
                    throw new Error("No boundary found");
                }
                break;
            }
            case "letter-zone": {
                const zone = await findAdminBoundary(
                    question.lat,
                    question.lng,
                    question.cat.adminLevel,
                );

                if (!zone) {
                    toast.error("No boundary found for this zone");
                    throw new Error("No boundary found");
                }

                let englishName = zone.properties?.["name:en"];

                if (!englishName) {
                    const name = zone.properties?.name;

                    if (/^[a-zA-Z]$/.test(name[0])) {
                        englishName = name;
                    } else {
                        toast.error("No English name found for this zone");
                        throw new Error("No English name");
                    }
                }

                const letter = englishName[0].toUpperCase();

                boundary = turf.featureCollection(
                    osmtogeojson(
                        await findPlacesInZone(
                            `[admin_level=${question.cat.adminLevel}]["name:en"~"^${letter}.+"]`, // Regex is faster than filtering afterward
                            `Finding zones that start with the same letter (${letter})...`,
                            "relation",
                            "geom",
                            [
                                `[admin_level=${question.cat.adminLevel}]["name"~"^${letter}.+"]`,
                            ], // Regex is faster than filtering afterward
                        ),
                    ).features.filter(
                        (x): x is Feature<Polygon | MultiPolygon> =>
                            x.geometry &&
                            (x.geometry.type === "Polygon" ||
                                x.geometry.type === "MultiPolygon"),
                    ),
                );

                // It's either simplify or crash. Technically this could be bad if someone's hiding zone was inside multiple zones, but that's unlikely.
                boundary = safeUnion(
                    turf.simplify(boundary, {
                        tolerance: 0.001,
                        highQuality: true,
                        mutate: true,
                    }),
                );

                break;
            }
            case "airport":
            case "major-city":
            case "aquarium-full":
            case "zoo-full":
            case "theme_park-full":
            case "peak-full":
            case "museum-full":
            case "hospital-full":
            case "cinema-full":
            case "library-full":
            case "golf_course-full":
            case "consulate-full":
            case "park-full":
            case "custom-points": {
                const data = asPointFeatureCollection(
                    await findMatchingPlaces(question),
                );

                const voronoi = geoSpatialVoronoi(data);
                const point = turf.point([question.lng, question.lat]);

                boundary = findVoronoiCellForPoint(voronoi, point);
                break;
            }
        }

        return boundary;
    },
    (question: MatchingQuestion & { geo?: unknown; cat?: unknown }) =>
        JSON.stringify({
            type: question.type,
            lat: question.lat,
            lng: question.lng,
            cat: question.cat,
            geo: question.geo,
            entirety: polyGeoJSON.get()
                ? polyGeoJSON.get()
                : mapGeoLocation.get(),
        }),
);

export const adjustPerMatching = async (
    question: MatchingQuestion,
    mapData: any,
) => {
    if (mapData === null) return;

    const boundary = await determineMatchingBoundary(question);

    if (boundary === false) {
        return mapData;
    }

    return modifyMapData(mapData, boundary, question.same);
};

export const hiderifyMatching = async (question: MatchingQuestion) => {
    const $hiderMode = hiderMode.get();
    if ($hiderMode === false) {
        return question;
    }

    if (
        [
            "aquarium",
            "zoo",
            "theme_park",
            "peak",
            "museum",
            "hospital",
            "cinema",
            "library",
            "golf_course",
            "consulate",
            "park",
        ].includes(question.type)
    ) {
        const questionNearest = await nearestToQuestion(
            question as HomeGameMatchingQuestions,
        );
        const hiderNearest = await nearestToQuestion({
            lat: $hiderMode.latitude,
            lng: $hiderMode.longitude,
            same: true,
            type: (question as HomeGameMatchingQuestions).type,
            drag: false,
            color: "black",
            collapsed: false,
            hidden: false,
        });

        question.same =
            questionNearest.properties.name === hiderNearest.properties.name;

        return question;
    }

    if (
        question.type === "same-first-letter-station" ||
        question.type === "same-length-station" ||
        question.type === "same-train-line"
    ) {
        const hiderPoint = turf.point([
            $hiderMode.longitude,
            $hiderMode.latitude,
        ]);
        const seekerPoint = turf.point([question.lng, question.lat]);

        const places = osmtogeojson(
            await findPlacesInZone(
                "[railway=station]",
                "Finding train stations. This may take a while. Do not press any buttons while this is processing. Don't worry, it will be cached.",
                "node",
            ),
        ) as FeatureCollection<Point>;

        const nearestHiderTrainStation = turf.nearestPoint(hiderPoint, places);
        const nearestSeekerTrainStation = turf.nearestPoint(
            seekerPoint,
            places,
        );

        if (question.type === "same-train-line") {
            const nodes = await trainLineNodeFinder(
                nearestSeekerTrainStation.properties.id,
            );

            const hiderId = parseInt(
                nearestHiderTrainStation.properties.id.split("/")[1],
            );

            if (nodes.includes(hiderId)) {
                question.same = true;
            } else {
                question.same = false;
            }
        }

        const hiderEnglishName =
            nearestHiderTrainStation.properties["name:en"] ||
            nearestHiderTrainStation.properties.name;
        const seekerEnglishName =
            nearestSeekerTrainStation.properties["name:en"] ||
            nearestSeekerTrainStation.properties.name;

        if (!hiderEnglishName || !seekerEnglishName) {
            return question;
        }

        if (question.type === "same-first-letter-station") {
            if (
                hiderEnglishName[0].toUpperCase() ===
                seekerEnglishName[0].toUpperCase()
            ) {
                question.same = true;
            } else {
                question.same = false;
            }
        } else if (question.type === "same-length-station") {
            if (hiderEnglishName.length === seekerEnglishName.length) {
                question.lengthComparison = "same";
            } else if (hiderEnglishName.length < seekerEnglishName.length) {
                question.lengthComparison = "shorter";
            } else {
                question.lengthComparison = "longer";
            }
        }

        return question;
    }

    const $mapGeoJSON = mapGeoJSON.get();
    if ($mapGeoJSON === null) return question;

    let feature = null;

    try {
        feature = holedMask((await adjustPerMatching(question, $mapGeoJSON))!);
    } catch {
        try {
            feature = await adjustPerMatching(question, {
                type: "FeatureCollection",
                features: [holedMask($mapGeoJSON)],
            });
        } catch {
            return question;
        }
    }

    if (feature === null || feature === undefined) return question;

    const hiderPoint = turf.point([$hiderMode.longitude, $hiderMode.latitude]);

    if (turf.booleanPointInPolygon(hiderPoint, feature)) {
        question.same = !question.same;
    }

    return question;
};

export const matchingPlanningPolygon = async (question: MatchingQuestion) => {
    try {
        const boundary = await determineMatchingBoundary(question);

        if (boundary === false) {
            return false;
        }

        return turf.polygonToLine(boundary);
    } catch {
        return false;
    }
};
