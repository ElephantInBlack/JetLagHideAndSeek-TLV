import type { Feature, FeatureCollection } from "geojson";

import {
    adjustPerMatching,
    hiderifyMatching,
    matchingPlanningPolygon,
} from "./questions/matching";
import {
    adjustPerMeasuring,
    hiderifyMeasuring,
    measuringPlanningPolygon,
} from "./questions/measuring";
import {
    adjustPerRadius,
    hiderifyRadius,
    radiusPlanningPolygon,
} from "./questions/radius";
import {
    adjustPerTentacle,
    hiderifyTentacles,
    tentaclesPlanningPolygon,
} from "./questions/tentacles";
import {
    adjustPerThermometer,
    hiderifyThermometer,
    thermometerPlanningPolygon,
} from "./questions/thermometer";
import type { Question, Questions } from "./schema";

let questionCalculationCache: {
    base: any;
    hashes: string[];
    results: any[];
} | null = null;

export * from "./geo-utils";

export const hiderifyQuestion = async (question: Question) => {
    if (question.data.drag) {
        switch (question.id) {
            case "radius":
                question.data = hiderifyRadius(question.data);
                break;
            case "thermometer":
                question.data = await hiderifyThermometer(question.data);
                break;
            case "tentacles":
                question.data = await hiderifyTentacles(question.data);
                break;
            case "matching":
                question.data = await hiderifyMatching(question.data);
                break;
            case "measuring":
                question.data = await hiderifyMeasuring(question.data);
                break;
        }
    }

    return question;
};

export const determinePlanningPolygon = async (
    question: Question,
    planningModeEnabled: boolean,
) => {
    if (planningModeEnabled && question.data.drag && !question.data.hidden) {
        switch (question.id) {
            case "radius":
                return radiusPlanningPolygon(question.data);
            case "thermometer":
                return thermometerPlanningPolygon(question.data);
            case "tentacles":
                return tentaclesPlanningPolygon(question.data);
            case "matching":
                return matchingPlanningPolygon(question.data);
            case "measuring":
                return measuringPlanningPolygon(question.data);
        }
    }
};

export async function adjustMapGeoDataForQuestion(
    question: any,
    mapGeoData: any,
) {
    if (question.data.hidden) {
        return mapGeoData;
    }

    try {
        switch (question?.id) {
            case "radius":
                return await adjustPerRadius(question.data, mapGeoData);
            case "thermometer":
                return await adjustPerThermometer(question.data, mapGeoData);
            case "tentacles":
                if (question.data.location === false) {
                    return adjustPerRadius(
                        { ...question.data, within: false },
                        mapGeoData,
                    );
                }
                return await adjustPerTentacle(question.data, mapGeoData);
            case "matching":
                return await adjustPerMatching(question.data, mapGeoData);
            case "measuring":
                return await adjustPerMeasuring(question.data, mapGeoData);
            default:
                return mapGeoData;
        }
    } catch {
        return mapGeoData;
    }
}

export async function applyQuestionsToMapGeoData(
    questions: Questions,
    mapGeoData: any,
    planningModeEnabled: boolean,
    planningModeCallback?: (
        polygon: FeatureCollection | Feature,
        question: any,
    ) => void,
): Promise<any> {
    const baseMapGeoData = mapGeoData;
    const hashes = questions.map((question) => JSON.stringify(question));
    let startIndex = 0;

    const existingCache = questionCalculationCache;
    const canReuseCache =
        !planningModeEnabled && existingCache?.base === baseMapGeoData;
    if (canReuseCache && existingCache) {
        while (
            startIndex < hashes.length &&
            existingCache.hashes[startIndex] === hashes[startIndex]
        ) {
            startIndex++;
        }
        if (startIndex > 0) {
            mapGeoData = existingCache.results[startIndex - 1];
        }
    }

    const results =
        startIndex > 0 && existingCache
            ? existingCache.results.slice(0, startIndex)
            : [];

    for (let index = startIndex; index < questions.length; index++) {
        const question = questions[index];
        if (planningModeCallback) {
            const planningPolygon = await determinePlanningPolygon(
                question,
                planningModeEnabled,
            );
            if (planningPolygon) {
                planningModeCallback(planningPolygon, question);
            }
        }
        if (planningModeEnabled && question.data.drag) {
            results[index] = mapGeoData;
            continue;
        }

        mapGeoData = await adjustMapGeoDataForQuestion(question, mapGeoData);

        if (mapGeoData.type !== "FeatureCollection") {
            mapGeoData = {
                type: "FeatureCollection",
                features: [mapGeoData],
            };
        }
        results[index] = mapGeoData;
    }

    if (!planningModeEnabled) {
        questionCalculationCache = {
            base: baseMapGeoData,
            hashes,
            results,
        };
    }
    return mapGeoData;
}

export const clearQuestionCalculationCache = () => {
    questionCalculationCache = null;
};
