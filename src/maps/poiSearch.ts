export const normalizePoiSearchText = (value: string) =>
    value
        .normalize("NFKD")
        .replace(/[\u0591-\u05c7]/gu, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase();

export const matchesPoiSearch = (
    properties: Record<string, unknown>,
    query: string,
) => {
    const normalizedQuery = normalizePoiSearchText(query);
    if (!normalizedQuery) return true;

    const searchableText = [
        properties.displayName,
        properties.nameHe,
        properties.nameEn,
        properties.name,
    ]
        .filter((value): value is string => typeof value === "string")
        .join(" ");

    return normalizePoiSearchText(searchableText).includes(normalizedQuery);
};
