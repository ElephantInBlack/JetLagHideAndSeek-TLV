import * as turf from "@turf/turf";
import type { FeatureCollection, MultiPolygon, Point, Polygon } from "geojson";

const MIN_PADDING_METERS = 30_000;

/**
 * Builds a bounded planar Voronoi diagram for the metro-sized game area.
 * The previous implementation stitched and projected cells for the entire
 * globe, which was unnecessarily expensive for a fixed city map.
 */
export const geoSpatialVoronoi = (
    points: FeatureCollection<Point>,
): FeatureCollection<Polygon | MultiPolygon> => {
    if (points.features.length === 0) return turf.featureCollection([]);

    const projectedPoints = turf.toMercator(points);
    const [minX, minY, maxX, maxY] = turf.bbox(projectedPoints);
    const padding = Math.max(MIN_PADDING_METERS, maxX - minX, maxY - minY);
    const bounded = turf.voronoi(projectedPoints, {
        bbox: [minX - padding, minY - padding, maxX + padding, maxY + padding],
    });

    const ordered = projectedPoints.features.flatMap((projectedSite, index) => {
        const polygon = bounded.features.find((candidate) =>
            turf.booleanPointInPolygon(projectedSite, candidate),
        );
        if (!polygon) return [];
        const unprojected = turf.toWgs84(polygon);
        unprojected.properties = {
            ...(unprojected.properties ?? {}),
            site: points.features[index],
        };
        return [unprojected];
    });

    return turf.featureCollection(ordered);
};
