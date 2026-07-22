import { useStore } from "@nanostores/react";
import * as turf from "@turf/turf";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { LatitudeLongitude } from "@/components/LatLngPicker";
import PresetsDialog from "@/components/PresetsDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
    MENU_ITEM_CLASSNAME,
    SidebarMenuItem,
} from "@/components/ui/sidebar-l";
import { UnitSelect } from "@/components/UnitSelect";
import {
    drawingQuestionKey,
    hiderMode,
    isLoading,
    questionModified,
    questions,
    triggerLocalRefresh,
} from "@/lib/context";
import { cn, mapToObj } from "@/lib/utils";
import { findTentacleLocations } from "@/maps/api";
import { matchesPoiSearch } from "@/maps/poiSearch";
import { findTentacleGeometryLocations } from "@/maps/questions/tentacles";
import { distanceToRoad } from "@/maps/questions/roads";
import {
    type TentacleQuestion,
    type TraditionalTentacleQuestion,
} from "@/maps/schema";
import { TEL_AVIV_TENTACLE_TYPES } from "@/maps/telAvivQuestionSet";

import { QuestionCard } from "./base";

export const TentacleQuestionComponent = ({
    data,
    questionKey,
    sub,
    className,
}: {
    data: TentacleQuestion;
    questionKey: number;
    sub?: string;
    className?: string;
}) => {
    const $questions = useStore(questions);
    const $drawingQuestionKey = useStore(drawingQuestionKey);
    const $isLoading = useStore(isLoading);
    const label = `Tentacles
    ${
        $questions
            .filter((q) => q.id === "tentacles")
            .map((q) => q.key)
            .indexOf(questionKey) + 1
    }`;

    return (
        <QuestionCard
            questionKey={questionKey}
            label={label}
            sub={sub}
            className={className}
            collapsed={data.collapsed}
            setCollapsed={(collapsed) => {
                data.collapsed = collapsed; // Doesn't trigger a re-render so no need for questionModified
            }}
            locked={!data.drag}
            setLocked={(locked) => questionModified((data.drag = !locked))}
            hidden={data.hidden}
            setHidden={(hidden) => questionModified((data.hidden = !hidden))}
        >
            <SidebarMenuItem>
                <div className={cn(MENU_ITEM_CLASSNAME, "gap-2 flex flex-row")}>
                    <Input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        className="rounded-md p-2 w-16"
                        value={data.radius}
                        onChange={(e) => {
                            const radius = parseFloat(e.target.value);
                            if (!Number.isFinite(radius)) return;
                            data.radius = radius;
                            questionModified();
                        }}
                        disabled={!data.drag}
                    />
                    <UnitSelect
                        unit={data.unit}
                        onChange={(unit) =>
                            questionModified((data.unit = unit))
                        }
                        disabled={!data.drag || $isLoading}
                    />
                </div>
            </SidebarMenuItem>
            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                <Select
                    trigger="Location Type"
                    options={TEL_AVIV_TENTACLE_TYPES}
                    value={data.locationType}
                    onValueChange={async (value) => {
                        if (value === "custom") {
                            const priorLocations = await findTentacleLocations(
                                data as TraditionalTentacleQuestion,
                            );

                            data.locationType = "custom";
                            data.places = priorLocations.features.map((x) => ({
                                ...x,
                                properties: {
                                    ...x.properties,
                                    name:
                                        (x.properties as any)?.["name:en"] ??
                                        x.properties?.name,
                                },
                            }));
                            data.location = false;
                        } else {
                            data.location = false;
                            data.locationType = value;
                        }
                        questionModified();
                    }}
                    disabled={!data.drag || $isLoading}
                />
            </SidebarMenuItem>
            {data.locationType === "custom" && data.drag && (
                <>
                    <p className="px-2 mb-1 text-center text-orange-500">
                        To modify tentacle locations, enable it:
                        <Checkbox
                            className="mx-1 my-1"
                            checked={$drawingQuestionKey === questionKey}
                            onCheckedChange={(checked) => {
                                if (checked) {
                                    drawingQuestionKey.set(questionKey);
                                } else {
                                    drawingQuestionKey.set(-1);
                                }
                            }}
                            disabled={!data.drag || $isLoading}
                        />
                        and use the buttons at the bottom left of the map.
                    </p>
                    <div className="flex justify-center mb-2">
                        <PresetsDialog
                            data={data}
                            presetTypeHint="custom-tentacles"
                        />
                    </div>
                </>
            )}
            <LatitudeLongitude
                latitude={data.lat}
                longitude={data.lng}
                colorName={data.color}
                onChange={(lat, lng) => {
                    if (lat !== null) {
                        data.lat = lat;
                    }
                    if (lng !== null) {
                        data.lng = lng;
                    }
                    questionModified();
                }}
                disabled={!data.drag || $isLoading}
            />
            <SidebarMenuItem className={MENU_ITEM_CLASSNAME}>
                <TentacleLocationSelector
                    data={data}
                    disabled={!data.drag || $isLoading}
                />
            </SidebarMenuItem>
        </QuestionCard>
    );
};

const TentacleLocationSelector = ({
    data,
    disabled,
}: {
    data: TentacleQuestion;
    disabled: boolean;
}) => {
    const refreshToken = useStore(triggerLocalRefresh);
    const $hiderMode = useStore(hiderMode);
    const [locations, setLocations] = useState<any>(() =>
        turf.featureCollection(
            data.locationType === "custom" ? (data.places ?? []) : [],
        ),
    );
    const [loading, setLoading] = useState(data.locationType !== "custom");
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        const request =
            data.locationType === "custom"
                ? Promise.resolve(turf.featureCollection(data.places ?? []))
                : findTentacleGeometryLocations(data);

        request
            .then((result) => {
                if (!cancelled) setLocations(result);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [data.locationType, data.places, refreshToken]);

    // Keep every POI available, but put nearby choices first.
    const availableFeatures = useMemo(() => {
        const features = [...locations.features];
        if (
            data.lat === null ||
            data.lng === null ||
            data.radius === undefined ||
            data.radius === null
        ) {
            return features.sort((a: any, b: any) =>
                (a.properties.displayName ?? a.properties.name).localeCompare(
                    b.properties.displayName ?? b.properties.name,
                ),
            );
        }

        const center = turf.point([data.lng, data.lat]);

        return features
            .map((feature: any) => ({
                feature,
                distance:
                    feature.geometry.type === "LineString" ||
                    feature.geometry.type === "MultiLineString"
                        ? distanceToRoad(center, feature)
                        : turf.distance(center, feature, { units: data.unit }),
            }))
            .sort((a, b) => a.distance - b.distance)
            .map(({ feature }) => feature);
    }, [locations, data.lat, data.lng, data.radius, data.unit]);

    // Clear a selection only when the POI no longer belongs to the category.
    const selectedLocationId = data.location
        ? ((data.location.properties as any)?.id ??
          data.location.properties?.name)
        : null;
    const matchingFeatures = useMemo(
        () =>
            availableFeatures.filter((feature: any) =>
                matchesPoiSearch(feature.properties, searchQuery),
            ),
        [availableFeatures, searchQuery],
    );
    const selectableFeatures = useMemo(() => {
        if (!selectedLocationId) return matchingFeatures;
        const selectedFeature = availableFeatures.find(
            (feature: any) =>
                (feature.properties.id ?? feature.properties.name) ===
                selectedLocationId,
        );
        if (
            !selectedFeature ||
            matchingFeatures.some(
                (feature: any) =>
                    (feature.properties.id ?? feature.properties.name) ===
                    selectedLocationId,
            )
        ) {
            return matchingFeatures;
        }
        return [selectedFeature, ...matchingFeatures];
    }, [availableFeatures, matchingFeatures, selectedLocationId]);

    useEffect(() => setSearchQuery(""), [data.locationType]);
    useEffect(() => {
        if (
            selectedLocationId &&
            !availableFeatures.find(
                (feature: any) =>
                    (feature.properties.id ?? feature.properties.name) ===
                    selectedLocationId,
            )
        ) {
            data.location = false;
            questionModified();
        }
    }, [selectedLocationId, availableFeatures, data]);

    const selectorDisabled = !!$hiderMode || disabled || loading;

    return (
        <div className="flex w-full flex-col gap-2">
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    aria-label="Search Tentacles POIs"
                    className="pl-9"
                    dir="auto"
                    placeholder="חיפוש מקום..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    disabled={selectorDisabled}
                />
            </div>
            {searchQuery && matchingFeatures.length === 0 && (
                <p className="px-1 text-xs text-muted-foreground">
                    לא נמצאו מקומות תואמים
                </p>
            )}
            <Select
                trigger="Location"
                options={{
                    false: "Not Within",
                    ...mapToObj(selectableFeatures, (feature: any) => [
                        feature.properties.id ?? feature.properties.name,
                        feature.properties.displayName ??
                            feature.properties.name,
                    ]),
                }}
                value={
                    data.location
                        ? ((data.location.properties as any).id ??
                          data.location.properties.name)
                        : "false"
                }
                onValueChange={(value) => {
                    if (value === "false") {
                        data.location = false;
                    } else {
                        data.location =
                            availableFeatures.find(
                                (feature: any) =>
                                    (feature.properties.id ??
                                        feature.properties.name) === value,
                            ) ?? false;
                    }

                    questionModified();
                }}
                disabled={selectorDisabled}
            />
        </div>
    );
};
