import { expect, test } from "vitest";

import { questionSchema } from "@/maps/schema";

test("new Radius and Tentacles questions default to 2 kilometers", () => {
    const radius = questionSchema.parse({
        id: "radius",
        data: { lat: 32.075, lng: 34.81 },
    });
    const tentacles = questionSchema.parse({
        id: "tentacles",
        data: { lat: 32.075, lng: 34.81 },
    });

    expect(radius.data).toMatchObject({ radius: 2, unit: "kilometers" });
    expect(tentacles.data).toMatchObject({ radius: 2, unit: "kilometers" });
});

test("Thermometer endpoints use the same question color", () => {
    const thermometer = questionSchema.parse({
        id: "thermometer",
        data: {
            latA: 32.07,
            lngA: 34.78,
            latB: 32.08,
            lngB: 34.8,
            colorA: "blue",
            colorB: "red",
        },
    });

    expect(thermometer.data.colorA).toBe("blue");
    expect(thermometer.data.colorB).toBe("blue");
});
