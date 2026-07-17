import { ICON_COLORS } from "@/maps/api/constants";

export type QuestionColorName = keyof typeof ICON_COLORS;

export const QUESTION_COLOR_ORDER = Object.keys(
    ICON_COLORS,
) as QuestionColorName[];

export const pickUnusedQuestionColor = (
    preferred: QuestionColorName,
    used: ReadonlySet<QuestionColorName>,
) => {
    if (!used.has(preferred)) return preferred;
    return QUESTION_COLOR_ORDER.find((color) => !used.has(color)) ?? preferred;
};
