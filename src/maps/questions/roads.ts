import * as turf from "@turf/turf";
import type { Feature, LineString, MultiLineString, Point } from "geojson";
import _ from "lodash";
import osmtogeojson from "osmtogeojson";

import { getOverpassData } from "@/maps/api";

export type MajorRoad = Feature<LineString | MultiLineString>;

const roadName = (road: MajorRoad) =>
    road.properties?.tags?.name ?? road.properties?.name;

/** Named motorway, trunk, primary, or secondary roads in the local game area. */
export const findMajorRoads = _.memoize(
    async (lat: number, lng: number) => {
        const data = await getOverpassData(
            `[out:json][timeout:25];way(around:30000,${lat},${lng})[highway~"^(motorway|trunk|primary|secondary)$"][name];out geom;`,
            "Finding major roads...",
        );
        return (osmtogeojson(data).features as MajorRoad[]).filter(
            (road) =>
                (road.geometry.type === "LineString" ||
                    road.geometry.type === "MultiLineString") &&
                Boolean(roadName(road)),
        );
    },
    (lat, lng) => `${lat.toFixed(3)},${lng.toFixed(3)}`,
);

export const findNearestMajorRoad = async (lat: number, lng: number) => {
    const point = turf.point([lng, lat]);
    const roads = await findMajorRoads(lat, lng);
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
    const roads = await findMajorRoads(lat, lng);
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
