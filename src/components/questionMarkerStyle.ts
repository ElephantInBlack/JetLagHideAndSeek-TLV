export type QuestionMarkerKind =
    | "hider"
    | "radius"
    | "tentacles"
    | "matching"
    | "measuring"
    | "thermometer-start"
    | "thermometer-end";

export const QUESTION_MARKER_SYMBOLS: Record<QuestionMarkerKind, string> = {
    hider: "H",
    radius: "○",
    tentacles: "✦",
    matching: "=",
    measuring: "↔",
    "thermometer-start": "A",
    "thermometer-end": "B",
};

export const QUESTION_MARKER_TITLES: Record<QuestionMarkerKind, string> = {
    hider: "Hider location",
    radius: "Radius question",
    tentacles: "Tentacles question",
    matching: "Matching question",
    measuring: "Measuring question",
    "thermometer-start": "Thermometer start",
    "thermometer-end": "Thermometer end",
};

export const questionMarkerColor = (color: keyof typeof ICON_COLORS) =>
    ICON_COLORS[color];

export const HIDER_MARKER_COLOR = "hsl(142 68% 36%)";
import { ICON_COLORS } from "@/maps/api/constants";
