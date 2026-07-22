export const TEL_AVIV_MATCHING_TYPES = {
    "transit-line": "Transit Line",
    "street-path": "Street or Path",
    "major-road": "Major Road",
    zone: "City",
    neighborhood: "Neighborhood",
    landmass: "Landmass",
    "park-full": "Park",
    "museum-full": "Museum",
    "cinema-full": "Movie Theater",
    "hospital-full": "Hospital",
    "library-full": "Library",
} as const;

export const TEL_AVIV_MEASURING_TYPES = {
    "rail-measure": "Train Station",
    coastline: "Coastline",
    "major-road": "Major Road",
    "park-full": "Park",
    "museum-full": "Museum",
    "library-full": "Library",
    "hospital-full": "Hospital",
} as const;

export const TEL_AVIV_TENTACLE_TYPES = {
    hospital: "Hospitals",
    library: "Libraries",
    cinema: "Movie Theaters",
    museum: "Museums",
    "major-road": "Major Roads",
} as const;

export const TEL_AVIV_MEASURING_STATION_IDS = new Set([
    "node/2930618401", // Tel Aviv University
    "node/2930618402", // Tel Aviv Savidor Center
    "node/2930618403", // Tel Aviv HaShalom
    "node/3978658308", // Tel Aviv HaHagana
]);

export const isTelAvivQuestionTypeAllowed = (id: string, type?: string) => {
    if (id === "tentacles") {
        return type !== undefined && type in TEL_AVIV_TENTACLE_TYPES;
    }
    if (id === "matching") {
        return type !== undefined && type in TEL_AVIV_MATCHING_TYPES;
    }
    if (id === "measuring") {
        return type !== undefined && type in TEL_AVIV_MEASURING_TYPES;
    }
    return true;
};
