import type {
    Feature,
    FeatureCollection,
    MultiPolygon,
    Point,
    Polygon,
} from "geojson";

import type { APILocations, Units } from "@/maps/schema";

export type LocalPlaceCategory =
    | APILocations
    | "mcdonalds"
    | "seven11"
    | "airport"
    | "major-city"
    | "station";

export interface LocalDataManifest {
    version: 1;
    generatedAt: string;
    source: "OpenStreetMap";
    attribution: string;
    relationIds: readonly number[];
    coverage: {
        center: readonly [number, number];
        radiusMeters: number;
        guaranteedTentacleRadiusMiles: number;
    };
    files: {
        boundaries: string;
        places: string;
        stations: string;
        reference: string;
        coastline: string;
    };
}

export interface LocalPlaceProperties {
    id: string;
    osmType: "node" | "way" | "relation";
    osmId: number;
    name: string;
    displayName: string;
    nameEn?: string;
    nameHe?: string;
    categories: LocalPlaceCategory[];
    tags: Record<string, string>;
}

export type LocalPlace = Feature<Point, LocalPlaceProperties>;

export interface CircleScope {
    center: readonly [number, number];
    radius: number;
    unit: Units;
    gameArea?: true;
    hebrewPoiLabels?: true;
}

export type PlaceScope = CircleScope | { gameArea: true };

export interface PlaceDataProvider {
    getPlaces(
        category: LocalPlaceCategory,
        scope?: PlaceScope,
    ): Promise<FeatureCollection<Point, LocalPlaceProperties>>;
    getNearest(
        category: LocalPlaceCategory,
        point: readonly [number, number],
    ): Promise<LocalPlace | null>;
    getStations(
        filters: readonly string[],
    ): Promise<FeatureCollection<Point, LocalPlaceProperties>>;
    getBoundary(id: number): Promise<Feature<Polygon | MultiPolygon> | null>;
    getGameBoundary(): Promise<Feature<Polygon | MultiPolygon>>;
    canAnswerCircle(scope: CircleScope): boolean;
}

export interface OsmElement {
    type: "node" | "way" | "relation";
    id: number;
    lat?: number;
    lon?: number;
    center?: { lat: number; lon: number };
    tags?: Record<string, string>;
}

export interface OsmResponse {
    elements: OsmElement[];
}
