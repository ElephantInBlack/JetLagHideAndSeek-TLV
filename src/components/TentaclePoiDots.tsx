import { useStore } from "@nanostores/react";
import type { Feature, Point } from "geojson";
import { useEffect, useMemo, useState } from "react";
import { CircleMarker, Tooltip } from "react-leaflet";
import { toast } from "react-toastify";

import { questions } from "@/lib/context";
import { findTentacleGeometryLocations } from "@/maps/questions/tentacles";

type PoiPoint = Feature<
    Point,
    {
        id?: string;
        name?: string;
        displayName?: string;
    }
>;

export const TentaclePoiDots = () => {
    const $questions = useStore(questions);
    const tentacleQuestions = useMemo(
        () =>
            $questions.filter(
                (question) =>
                    question.id === "tentacles" && !question.data.hidden,
            ),
        [$questions],
    );
    const [places, setPlaces] = useState<PoiPoint[]>([]);

    useEffect(() => {
        let cancelled = false;

        Promise.all(
            tentacleQuestions.map((question) =>
                findTentacleGeometryLocations(question.data),
            ),
        )
            .then((collections) => {
                if (cancelled) return;

                const uniquePlaces = new Map<string, PoiPoint>();
                collections
                    .flatMap((collection) => collection.features)
                    .forEach((place, index) => {
                        const id =
                            place.properties?.id ??
                            `${place.geometry.coordinates.join(",")}:${index}`;
                        uniquePlaces.set(id, place as PoiPoint);
                    });
                setPlaces([...uniquePlaces.values()]);
            })
            .catch((error) => {
                console.error("Could not display Tentacles POIs", error);
                if (!cancelled) {
                    setPlaces([]);
                    toast.error("Could not display the Tentacles POI markers", {
                        toastId: "tentacles-poi-markers-error",
                    });
                }
            });

        return () => {
            cancelled = true;
        };
    }, [tentacleQuestions]);

    return (
        <>
            {places.map((place) => {
                const [lng, lat] = place.geometry.coordinates;
                const name =
                    place.properties.displayName ??
                    place.properties.name ??
                    "POI";
                const id = place.properties.id ?? `${lng},${lat}:${name}`;

                return (
                    <CircleMarker
                        key={id}
                        center={[lat, lng]}
                        radius={3}
                        pathOptions={{
                            color: "#000000",
                            fillColor: "#000000",
                            fillOpacity: 0.9,
                            opacity: 1,
                            weight: 1,
                        }}
                    >
                        <Tooltip direction="top" sticky>
                            <span dir="auto">{name}</span>
                        </Tooltip>
                    </CircleMarker>
                );
            })}
        </>
    );
};
