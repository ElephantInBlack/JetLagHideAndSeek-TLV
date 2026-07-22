import * as turf from "@turf/turf";
import type { Feature, LineString, MultiLineString, Point } from "geojson";
import _ from "lodash";
import osmtogeojson from "osmtogeojson";

import { getOverpassData } from "@/maps/api";
import { BLANK_GEOJSON } from "@/maps/api/constants";

export type MajorRoad = Feature<LineString | MultiLineString>;

const roadName = (road: MajorRoad) =>
    road.properties?.tags?.name ?? road.properties?.name;

const groupRoadSegmentsByName = (segments: MajorRoad[]) =>
    Object.entries(_.groupBy(segments, roadName)).map(([name, roads]) =>
        turf.multiLineString(
            roads.flatMap((road) =>
                road.geometry.type === "LineString"
                    ? [road.geometry.coordinates]
                    : road.geometry.coordinates,
            ),
            { id: name, name, displayName: name },
        ) as MajorRoad,
    );

/**
 * All named motorway, trunk, primary, and secondary roads within the fixed
 * Tel Aviv game map. Loading this once makes a road answer consistent anywhere
 * in the map and preserves every mapped segment of a road name.
 */
export const findMajorRoads = _.memoize(async () => {
    const [west, south, east, north] = turf.bbox(BLANK_GEOJSON as any);
    const data = await getOverpassData(
        `[out:json][timeout:25];way(${south},${west},${north},${east})[highway~"^(motorway|trunk|primary|secondary)$"][name];out geom;`,
        "Loading major roads for the Tel Aviv map...",
    );
    const segments = (osmtogeojson(data).features as MajorRoad[]).filter(
        (road) =>
            (road.geometry.type === "LineString" ||
                road.geometry.type === "MultiLineString") &&
            Boolean(roadName(road)),
    );
    return groupRoadSegmentsByName(segments);
});

export const preloadMajorRoads = () => findMajorRoads();

export const findNearestMajorRoad = async (lat: number, lng: number) => {
    const point = turf.point([lng, lat]);
    const roads = await findMajorRoads();
    return roads.reduce<MajorRoad | false>((nearest, road) => {
        if (!nearest) return road;
        return turf.pointToLineDistance(point, road, { units: "meters" }) <
            turf.pointToLineDistance(point, nearest, { units: "meters" })
            ? road
            : nearest;
    }, false);
};

export const majorRoadName = (road: MajorRoad | false) =>
    road ? String(roadName(road)) : false;

export const majorRoadBoundary = async (lat: number, lng: number) => {
    const selected = await findNearestMajorRoad(lat, lng);
    const name = majorRoadName(selected);
    if (!name) return false;
    const roads = await findMajorRoads();
    const matching = roads.filter((road) => roadName(road) === name);
    const buffered = turf.buffer(turf.featureCollection(matching), 0.05, {
        units: "kilometers",
    });
    return buffered ? turf.union(buffered) : false;
};

export const majorRoadDisplayFeature = (road: MajorRoad) => ({
    ...road,
    properties: {
        ...road.properties,
        id: majorRoadName(road),
        name: majorRoadName(road),
        displayName: majorRoadName(road),
    },
});

export const distanceToRoad = (point: Feature<Point>, road: MajorRoad) =>
    turf.pointToLineDistance(point, road, { units: "kilometers" });
