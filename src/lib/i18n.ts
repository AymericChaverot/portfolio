export type Lang = "fr" | "en";

export const LANGS: readonly Lang[] = ["fr", "en"] as const;
export const DEFAULT_LANG: Lang = "fr";

export const LANG_LABELS: Record<Lang, string> = {
    fr: "Français",
    en: "English",
};

export function isLang(value: unknown): value is Lang {
    return value === "fr" || value === "en";
}

export function toLang(value: unknown, fallback: Lang = DEFAULT_LANG): Lang {
    return isLang(value) ? value : fallback;
}

/** Objet traduisible tel que stocké en base : {"fr": "...", "en": "..."} */
export type I18nText = Partial<Record<Lang, string>>;
export type I18nList = Partial<Record<Lang, string[]>>;

function parse(raw: unknown): unknown {
    if (raw === null || raw === undefined) return {};
    if (typeof raw === "object") return raw;
    if (typeof raw !== "string") return {};
    const trimmed = raw.trim();
    if (!trimmed) return {};
    // Une valeur non-JSON (saisie manuelle en base) est traitée comme un
    // texte unique valable pour toutes les langues plutôt que perdue.
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return trimmed;
    try {
        return JSON.parse(trimmed);
    } catch {
        return trimmed;
    }
}

/** Résout un champ traduisible en texte, avec repli sur l'autre langue. */
export function pick(raw: unknown, lang: Lang, fallback = ""): string {
    const value = parse(raw);

    if (typeof value === "string") return value || fallback;
    if (typeof value !== "object" || value === null) return fallback;

    const map = value as Record<string, unknown>;
    const direct = map[lang];
    if (typeof direct === "string" && direct.trim()) return direct;

    // Repli : langue par défaut, puis n'importe quelle traduction remplie.
    for (const candidate of [DEFAULT_LANG, ...LANGS]) {
        const other = map[candidate];
        if (typeof other === "string" && other.trim()) return other;
    }
    return fallback;
}

/** Résout un champ traduisible contenant une liste de chaînes. */
export function pickList(raw: unknown, lang: Lang): string[] {
    const value = parse(raw);

    if (Array.isArray(value)) return value.map(String);
    if (typeof value !== "object" || value === null) return [];

    const map = value as Record<string, unknown>;
    const direct = map[lang];
    if (Array.isArray(direct) && direct.length) return direct.map(String);

    for (const candidate of [DEFAULT_LANG, ...LANGS]) {
        const other = map[candidate];
        if (Array.isArray(other) && other.length) return other.map(String);
    }
    return [];
}

/** Renvoie l'objet i18n complet, pour préremplir les formulaires admin. */
export function asI18n(raw: unknown): I18nText {
    const value = parse(raw);
    if (typeof value === "string") {
        return Object.fromEntries(LANGS.map((l) => [l, value])) as I18nText;
    }
    if (typeof value !== "object" || value === null) return {};
    const out: I18nText = {};
    for (const lang of LANGS) {
        const v = (value as Record<string, unknown>)[lang];
        if (typeof v === "string") out[lang] = v;
    }
    return out;
}

/** Idem pour les listes : renvoie {fr: [...], en: [...]}. */
export function asI18nList(raw: unknown): I18nList {
    const value = parse(raw);
    if (Array.isArray(value)) {
        return Object.fromEntries(
            LANGS.map((l) => [l, value.map(String)]),
        ) as I18nList;
    }
    if (typeof value !== "object" || value === null) return {};
    const out: I18nList = {};
    for (const lang of LANGS) {
        const v = (value as Record<string, unknown>)[lang];
        if (Array.isArray(v)) out[lang] = v.map(String);
    }
    return out;
}

/** Sérialise pour l'écriture en base. */
export function encodeI18n(value: I18nText | I18nList): string {
    return JSON.stringify(value ?? {});
}

// ── URLs localisées ───────────────────────────────────────────────────────

export function langPath(lang: Lang, path = ""): string {
    const clean = path.replace(/^\/+/, "");
    return clean ? `/${lang}/${clean}` : `/${lang}`;
}

/**
 * Remplace le segment de langue dans un chemin courant.
 * `/fr/projects/nexus` + `en` → `/en/projects/nexus`
 */
export function switchLangPath(pathname: string, target: Lang): string {
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length && isLang(segments[0])) {
        segments[0] = target;
        return `/${segments.join("/")}`;
    }
    return langPath(target);
}
