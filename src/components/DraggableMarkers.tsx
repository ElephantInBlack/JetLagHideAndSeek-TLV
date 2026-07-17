import { useStore } from "@nanostores/react";
import { DivIcon, type DragEndEvent } from "leaflet";
import { useMemo, useState } from "react";
import { Fragment } from "react/jsx-runtime";
import { Marker } from "react-leaflet";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
    autoSave,
    hiderMode,
    questionModified,
    questions,
    save,
    triggerLocalRefresh,
} from "@/lib/context";
import { findNearestTentacleLocation } from "@/maps/questions/tentacles";

import { LatitudeLongitude } from "./LatLngPicker";
import {
    MatchingQuestionComponent,
    MeasuringQuestionComponent,
    RadiusQuestionComponent,
    TentacleQuestionComponent,
    ThermometerQuestionComponent,
} from "./QuestionCards";
import {
    HIDER_MARKER_COLOR,
    QUESTION_MARKER_SYMBOLS,
    QUESTION_MARKER_TITLES,
    questionMarkerColor,
    type QuestionMarkerKind,
} from "./questionMarkerStyle";
import { Button } from "./ui/button";
import { SidebarMenu } from "./ui/sidebar-l";

let isDragging = false;
const tentacleDragGenerations = new Map<number, number>();

const ColoredMarker = ({
    latitude,
    longitude,
    color,
    kind,
    onChange,
    questionKey,
    sub = "",
}: {
    onChange: (event: DragEndEvent) => void;
    latitude: number;
    longitude: number;
    color: string;
    kind: QuestionMarkerKind;
    questionKey: number;
    sub?: string;
}) => {
    const $questions = useStore(questions);
    const $hiderMode = useStore(hiderMode);
    const $autoSave = useStore(autoSave);
    const [open, setOpen] = useState(false);
    const icon = useMemo(
        () =>
            new DivIcon({
                className: "question-map-marker",
                html: `<div title="${QUESTION_MARKER_TITLES[kind]}" style="
                    align-items:center;
                    background:${color};
                    border:3px solid white;
                    border-radius:50% 50% 50% 0;
                    box-shadow:0 2px 7px rgba(0,0,0,.45);
                    color:white;
                    display:flex;
                    font-family:system-ui,sans-serif;
                    font-size:16px;
                    font-weight:800;
                    height:30px;
                    justify-content:center;
                    transform:rotate(-45deg);
                    width:30px;
                "><span style="transform:rotate(45deg)">${QUESTION_MARKER_SYMBOLS[kind]}</span></div>`,
                iconAnchor: [15, 32],
                iconSize: [30, 32],
                popupAnchor: [0, -32],
            }),
        [color, kind],
    );

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <Marker
                position={[latitude, longitude]}
                icon={icon}
                draggable={true}
                eventHandlers={{
                    dragstart: () => {
                        isDragging = true;
                    },
                    dragend: (x) => {
                        onChange(x);
                        setTimeout(() => {
                            isDragging = false;
                        }, 100);
                    },
                    click: () => {
                        if (!isDragging) {
                            setOpen(true);
                        }
                    },
                }}
            />
            <DialogContent className="!bg-[hsl(var(--sidebar-background))] !text-white">
                {questionKey === -1 && $hiderMode !== false && (
                    <>
                        <h2 className="text-center text-2xl font-bold font-poppins">
                            {sub}
                        </h2>
                        <SidebarMenu>
                            <LatitudeLongitude
                                latitude={$hiderMode.latitude}
                                longitude={$hiderMode.longitude}
                                inlineEdit
                                onChange={(latitude, longitude) => {
                                    hiderMode.set({
                                        latitude:
                                            latitude ?? $hiderMode.latitude,
                                        longitude:
                                            longitude ?? $hiderMode.longitude,
                                    });
                                }}
                                label="Hider Location"
                            />
                        </SidebarMenu>
                    </>
                )}
                {$questions
                    .filter((q) => q.key === questionKey)
                    .map((q) => {
                        switch (q.id) {
                            case "radius":
                                return (
                                    <RadiusQuestionComponent
                                        key={q.key}
                                        data={q.data}
                                        questionKey={q.key}
                                        sub={sub}
                                    />
                                );
                            case "tentacles":
                                return (
                                    <TentacleQuestionComponent
                                        key={q.key}
                                        data={q.data}
                                        questionKey={q.key}
                                        sub={sub}
                                    />
                                );
                            case "thermometer":
                                return (
                                    <ThermometerQuestionComponent
                                        key={q.key}
                                        data={q.data}
                                        questionKey={q.key}
                                        sub={sub}
                                    />
                                );
                            case "matching":
                                return (
                                    <MatchingQuestionComponent
                                        key={q.key}
                                        data={q.data}
                                        questionKey={q.key}
                                        sub={sub}
                                    />
                                );
                            case "measuring":
                                return (
                                    <MeasuringQuestionComponent
                                        key={q.key}
                                        data={q.data}
                                        questionKey={q.key}
                                        sub={sub}
                                    />
                                );
                            default:
                                return null;
                        }
                    })}
                {questionKey === -1 && (
                    <Button // If it's the hider mode marker
                        onClick={() => {
                            hiderMode.set(false);
                        }}
                        variant="destructive"
                        className="font-semibold font-poppins"
                    >
                        Disable
                    </Button>
                )}
                {!$autoSave && (
                    <button
                        onClick={save}
                        className="bg-blue-600 p-2 rounded-md font-semibold font-poppins transition-shadow duration-500"
                    >
                        Save
                    </button>
                )}
            </DialogContent>
        </Dialog>
    );
};

export const DraggableMarkers = () => {
    useStore(triggerLocalRefresh);
    const $questions = useStore(questions);
    const $hiderMode = useStore(hiderMode);

    return (
        <Fragment>
            {$hiderMode !== false && (
                <ColoredMarker
                    color={HIDER_MARKER_COLOR}
                    kind="hider"
                    key="hider"
                    sub="Hider Location"
                    questionKey={-1}
                    latitude={$hiderMode.latitude}
                    longitude={$hiderMode.longitude}
                    onChange={(e) => {
                        $hiderMode.latitude =
                            e.target.getLatLng().lat ?? $hiderMode.latitude;
                        $hiderMode.longitude =
                            e.target.getLatLng().lng ?? $hiderMode.longitude;

                        if (autoSave.get()) {
                            hiderMode.set({
                                ...$hiderMode,
                            });
                        } else {
                            triggerLocalRefresh.set(Math.random());
                        }
                    }}
                />
            )}
            {$questions.map((question) => {
                if (!question.data) return null;
                if (!question.data.drag) return null;
                if (question.data.hidden) return null;
                if (
                    question.id === "matching" &&
                    question.data.type === "custom-zone"
                )
                    return null;

                switch (question.id) {
                    case "radius":
                    case "matching":
                    case "measuring":
                        return (
                            <ColoredMarker
                                color={questionMarkerColor(question.data.color)}
                                kind={question.id}
                                key={question.key}
                                questionKey={question.key}
                                latitude={question.data.lat}
                                longitude={question.data.lng}
                                onChange={(e) => {
                                    question.data.lat =
                                        e.target.getLatLng().lat;
                                    question.data.lng =
                                        e.target.getLatLng().lng;
                                    questionModified();
                                }}
                            />
                        );
                    case "tentacles":
                        return (
                            <ColoredMarker
                                color={questionMarkerColor(question.data.color)}
                                kind="tentacles"
                                key={question.key}
                                questionKey={question.key}
                                latitude={question.data.lat}
                                longitude={question.data.lng}
                                onChange={async (e) => {
                                    question.data.lat =
                                        e.target.getLatLng().lat;
                                    question.data.lng =
                                        e.target.getLatLng().lng;

                                    const generation =
                                        (tentacleDragGenerations.get(
                                            question.key,
                                        ) ?? 0) + 1;
                                    tentacleDragGenerations.set(
                                        question.key,
                                        generation,
                                    );
                                    questionModified();

                                    if (hiderMode.get() !== false) return;
                                    const nearest =
                                        await findNearestTentacleLocation(
                                            question.data,
                                        );
                                    if (
                                        tentacleDragGenerations.get(
                                            question.key,
                                        ) !== generation
                                    )
                                        return;

                                    question.data.location = nearest;
                                    questionModified();
                                }}
                            />
                        );
                    case "thermometer":
                        return (
                            <Fragment key={question.key}>
                                <ColoredMarker
                                    color={questionMarkerColor(
                                        question.data.colorA,
                                    )}
                                    kind="thermometer-start"
                                    key={"a" + question.key.toString()}
                                    questionKey={question.key}
                                    sub="Start"
                                    latitude={question.data.latA}
                                    longitude={question.data.lngA}
                                    onChange={(e) => {
                                        question.data.latA =
                                            e.target.getLatLng().lat;
                                        question.data.lngA =
                                            e.target.getLatLng().lng;
                                        questionModified();
                                    }}
                                />
                                <ColoredMarker
                                    color={questionMarkerColor(
                                        question.data.colorA,
                                    )}
                                    kind="thermometer-end"
                                    key={"b" + question.key.toString()}
                                    questionKey={question.key}
                                    sub="End"
                                    latitude={question.data.latB}
                                    longitude={question.data.lngB}
                                    onChange={(e) => {
                                        question.data.latB =
                                            e.target.getLatLng().lat;
                                        question.data.lngB =
                                            e.target.getLatLng().lng;
                                        questionModified();
                                    }}
                                />
                            </Fragment>
                        );
                    default:
                        return null;
                }
            })}
        </Fragment>
    );
};
