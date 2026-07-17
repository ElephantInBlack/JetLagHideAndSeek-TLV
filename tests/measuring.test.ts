import * as turf from "@turf/turf";
import { expect, test } from "vitest";

import { coastlineMeasurementLines } from "@/maps/questions/measuring";

test("coastline measuring excludes the synthetic offshore closure", () => {
    const coastline = turf.featureCollection([
        turf.lineString(
            [
                [34.8, 32.2],
                [34.76, 32.1],
                [34.74, 32.0],
                [33, 32.0],
                [33, 32.2],
                [34.8, 32.2],
            ],
            { note: "Offshore closure points are synthetic" },
        ),
    ]);

    const [measurementLine] = coastlineMeasurementLines(coastline);

    expect(measurementLine.geometry.coordinates).toEqual([
        [34.8, 32.2],
        [34.76, 32.1],
        [34.74, 32.0],
    ]);
});
