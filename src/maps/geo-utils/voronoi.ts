import * as turf from "@turf/turf";
import type {
    Feature,
    FeatureCollection,
    MultiPolygon,
    Point,
    Polygon,
} from "geojson";

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

/**
 * Finds the Voronoi cell represented by a point. The nearest-site fallback
 * handles points that land on a shared cell edge, where point-in-polygon can
 * legitimately return false for every cell because of floating-point noise.
 */
export const findVoronoiCellForPoint = (
    voronoi: FeatureCollection<Polygon | MultiPolygon>,
    point: Feature<Point>,
) => {
    const containing = voronoi.features.find((feature) =>
        turf.booleanPointInPolygon(point, feature),
    );
    if (containing) return containing;

    const cellsWithSites = voronoi.features.filter(
        (feature) => feature.properties?.site?.geometry?.type === "Point",
    );
    if (cellsWithSites.length === 0) return undefined;

    return cellsWithSites.reduce((nearest, candidate) =>
        turf.distance(point, candidate.properties!.site) <
        turf.distance(point, nearest.properties!.site)
            ? candidate
            : nearest,
    );
};
