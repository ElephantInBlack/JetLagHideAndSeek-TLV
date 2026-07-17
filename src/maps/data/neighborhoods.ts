import * as turf from "@turf/turf";
import type {
    Feature,
    FeatureCollection,
    MultiPolygon,
    Point,
    Polygon,
} from "geojson";

type SourceKind =
    | "tel-aviv-municipal"
    | "ramat-gan-municipal-derived"
    | "cbs-sub-quarter";

interface RawNeighborhoodProperties {
    shem_shchuna?: string;
    nane?: string;
    TAT_ROVA?: number;
}

export interface NeighborhoodProperties {
    name: string;
    city: "tel-aviv" | "ramat-gan" | "givatayim";
    source: SourceKind;
}

export type NeighborhoodRegion = Feature<
    Polygon | MultiPolygon,
    NeighborhoodProperties
>;

const dataUrl = (path: string) =>
    `${import.meta.env.BASE_URL.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;

const SOURCES = {
    telAviv: "data/tel-aviv/neighborhoods-tel-aviv.geojson",
    ramatGan: "data/tel-aviv/neighborhoods-ramat-gan.geojson",
    givatayim: "data/tel-aviv/neighborhoods-givatayim.geojson",
} as const;

const loadGeoJson = async (path: string) => {
    const response = await fetch(dataUrl(path));
    if (!response.ok) {
        throw new Error(
            `Could not load local neighborhood boundaries (${response.status})`,
        );
    }
    return (await response.json()) as FeatureCollection<
        Polygon | MultiPolygon,
        RawNeighborhoodProperties
    >;
};

const normalizeMunicipalRegions = (
    collection: FeatureCollection<
        Polygon | MultiPolygon,
        RawNeighborhoodProperties
    >,
    city: "tel-aviv" | "ramat-gan",
    source: Exclude<SourceKind, "cbs-sub-quarter">,
): NeighborhoodRegion[] =>
    collection.features.map((feature, index) => ({
        ...feature,
        properties: {
            city,
            source,
            name:
                feature.properties?.shem_shchuna ??
                feature.properties?.nane ??
                `${city}-${index + 1}`,
        },
    }));

const dissolveGivatayimSubQuarters = (
    collection: FeatureCollection<
        Polygon | MultiPolygon,
        RawNeighborhoodProperties
    >,
): NeighborhoodRegion[] => {
    const groups = new Map<
        number | undefined,
        Feature<Polygon | MultiPolygon, RawNeighborhoodProperties>[]
    >();
    for (const feature of collection.features) {
        const key = feature.properties?.TAT_ROVA;
        groups.set(key, [...(groups.get(key) ?? []), feature]);
    }

    return [...groups.entries()].flatMap(([subQuarter, features]) => {
        if (subQuarter === undefined || features.length === 0) return [];
        const geometry = turf.union(turf.featureCollection(features));
        if (!geometry) return [];
        return [
            turf.feature(geometry.geometry, {
                city: "givatayim" as const,
                source: "cbs-sub-quarter" as const,
                name: `Givatayim sub-quarter ${subQuarter}`,
            }),
        ];
    });
};

let regionsPromise: Promise<NeighborhoodRegion[]> | null = null;

export const getNeighborhoodRegions = () => {
    regionsPromise ??= Promise.all([
        loadGeoJson(SOURCES.telAviv),
        loadGeoJson(SOURCES.ramatGan),
        loadGeoJson(SOURCES.givatayim),
    ]).then(([telAviv, ramatGan, givatayim]) => [
        ...normalizeMunicipalRegions(telAviv, "tel-aviv", "tel-aviv-municipal"),
        ...normalizeMunicipalRegions(
            ramatGan,
            "ramat-gan",
            "ramat-gan-municipal-derived",
        ),
        ...dissolveGivatayimSubQuarters(givatayim),
    ]);
    return regionsPromise;
};

export const getNeighborhoodBoundary = async (point: Feature<Point>) =>
    (await getNeighborhoodRegions()).find((region) =>
        turf.booleanPointInPolygon(point, region),
    );
