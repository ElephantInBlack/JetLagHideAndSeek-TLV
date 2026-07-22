import * as turf from "@turf/turf";

import { hiderMode } from "@/lib/context";
import { findTentacleLocations } from "@/maps/api";
import { localPlaceDataProvider } from "@/maps/data";
import {
    arcBuffer,
    findVoronoiCellForPoint,
    safeUnion,
} from "@/maps/geo-utils";
import { geoSpatialVoronoi } from "@/maps/geo-utils";
import type { TentacleQuestion, Units } from "@/maps/schema";
import {
    findMajorRoads,
    findNearestMajorRoad,
    majorRoadBoundary,
    majorRoadDisplayFeature,
} from "./roads";

const filterPointsWithinRadius = (
    points: any,
    centerLng: number,
    centerLat: number,
    radius: number,
    unit: Units,
) => {
    if (
        centerLng === null ||
        centerLat === null ||
        radius === undefined ||
        radius === null
    ) {
        return points;
    }
    const center = turf.point([centerLng, centerLat]);

    return turf.featureCollection(
        points.features.filter((feature: any) => {
            const coords =
                feature?.geometry?.coordinates ??
                (feature?.properties?.lon && feature?.properties?.lat
                    ? [feature.properties.lon, feature.properties.lat]
                    : null);

            if (!coords) return false;

            const pt = turf.point(coords);
            const dist = turf.distance(center, pt, { units: unit });
            return dist <= radius;
        }),
    );
};

/**
 * Returns every POI that can influence a nearest-place answer. Eligibility is
 * still limited by the question radius, but Voronoi cells must include nearby
 * competitors outside that radius or the visible result can incorrectly turn
 * into a circle.
 */
export const findTentacleGeometryLocations = async (
    question: TentacleQuestion,
) => {
    if (question.locationType === "custom") {
        return turf.featureCollection(question.places);
    }
    if (question.locationType === "major-road") {
        return turf.featureCollection(
            (await findMajorRoads(question.lat, question.lng)).map(
                majorRoadDisplayFeature,
            ),
        );
    }

    return localPlaceDataProvider.getPlaces(question.locationType, {
        gameArea: true,
        hebrewPoiLabels: true,
    });
};

export const findNearestTentacleLocation = async (
    question: TentacleQuestion,
) => {
    if (question.locationType === "major-road") {
        const road = await findNearestMajorRoad(question.lat, question.lng);
        return road ? majorRoadDisplayFeature(road) : false;
    }
    const rawPoints =
        question.locationType === "custom"
            ? turf.featureCollection(question.places)
            : await findTentacleLocations(question);
    const points = filterPointsWithinRadius(
        rawPoints,
        question.lng,
        question.lat,
        question.radius,
        question.unit,
    );

    if (points.features.length === 0) return false;
    return turf.nearestPoint(turf.point([question.lng, question.lat]), points);
};

export const adjustPerTentacle = async (
    question: TentacleQuestion,
    mapData: any,
) => {
    if (mapData === null) return;
    if (question.location === false) {
        throw new Error("Must have a location");
    }

    if (question.locationType === "major-road") {
        const boundary = await majorRoadBoundary(question.lat, question.lng);
        if (!boundary) return mapData;
        const circle = await arcBuffer(
            turf.featureCollection([turf.point([question.lng, question.lat])]),
            question.radius,
            question.unit,
        );
        return turf.intersect(turf.featureCollection([safeUnion(mapData), boundary, circle]));
    }

    const points: any = await findTentacleGeometryLocations(question);

    const voronoi = geoSpatialVoronoi(points);

    const correctPolygon = findVoronoiCellForPoint(voronoi, question.location);
    if (!correctPolygon) {
        return mapData;
    }

    const circle = await arcBuffer(
        turf.featureCollection([turf.point([question.lng, question.lat])]),
        question.radius,
        question.unit,
    );

    return turf.intersect(
        turf.featureCollection([safeUnion(mapData), correctPolygon, circle]),
    );
};

export const hiderifyTentacles = async (question: TentacleQuestion) => {
    const $hiderMode = hiderMode.get();
    if ($hiderMode === false) {
        return question;
    }

    if (question.locationType === "major-road") {
        const hider = turf.point([$hiderMode.longitude, $hiderMode.latitude]);
        const location = turf.point([question.lng, question.lat]);
        if (turf.distance(hider, location, { units: question.unit }) > question.radius) {
            question.location = false;
            return question;
        }
        const road = await findNearestMajorRoad(
            $hiderMode.latitude,
            $hiderMode.longitude,
        );
        question.location = road ? majorRoadDisplayFeature(road) : false;
        return question;
    }

    const points: any = await findTentacleGeometryLocations(question);

    const voronoi = geoSpatialVoronoi(points);

    const hider = turf.point([$hiderMode.longitude, $hiderMode.latitude]);
    const location = turf.point([question.lng, question.lat]);

    if (
        turf.distance(hider, location, { units: question.unit }) >
        question.radius
    ) {
        question.location = false;
        return question;
    }

    let correctLocation: any = null;

    const correctPolygon = voronoi.features.find(
        (feature: any, index: number) => {
            const pointIn =
                turf.booleanPointInPolygon(hider, feature.geometry) || false;

            if (pointIn) {
                correctLocation = points.features[index];
            }
            return pointIn;
        },
    );

    if (!correctPolygon) {
        return question;
    }

    question.location = correctLocation!;
    return question;
};

export const tentaclesPlanningPolygon = async (question: TentacleQuestion) => {
    if (question.locationType === "major-road") {
        const boundary = await majorRoadBoundary(question.lat, question.lng);
        return boundary ? turf.polygonToLine(boundary) : false;
    }
    const points: any = await findTentacleGeometryLocations(question);

    const voronoi = geoSpatialVoronoi(points);
    const circle = await arcBuffer(
        turf.featureCollection([turf.point([question.lng, question.lat])]),
        question.radius,
        question.unit,
    );

    const interiorVoronoi = voronoi.features
        .map((feature) =>
            turf.intersect(turf.featureCollection([feature, circle])),
        )
        .filter((feature) => feature !== null);

    return turf.combine(
        turf.featureCollection(
            interiorVoronoi
                .map((x: any) => turf.polygonToLine(x))
                .flatMap((line) =>
                    line.type === "FeatureCollection" ? line.features : [line],
                ),
        ),
    );
};
