import { ActionError, type ActionAPIContext } from "astro:actions";
import { z } from "astro:schema";
import { all, get, run, transaction } from "../lib/db";
import { invalidateContent } from "../lib/content";

/** Toute action d'écriture exige une session admin valide. */
export function requireAuth(context: ActionAPIContext) {
    const user = context.locals.user;
    if (!user) {
        throw new ActionError({
            code: "UNAUTHORIZED",
            message: "Session expirée. Reconnecte-toi.",
        });
    }
    return user;
}

// ── Champs traduisibles ───────────────────────────────────────────────────
// Les formulaires envoient des clés plates (`title_fr`, `title_en`) : c'est
// plus simple à parser depuis un FormData que des clés imbriquées.

/**
 * Case à cocher de formulaire.
 *
 * `z.coerce.boolean()` ne convient pas : il applique `Boolean(value)`, donc
 * la chaîne "false" devient `true`. Et une case décochée n'est pas envoyée
 * du tout, il faut donc accepter l'absence de valeur.
 */
export const checkbox = z.preprocess(
    (value) => value === "true" || value === "on" || value === true,
    z.boolean(),
);

/**
 * Champ texte d'un formulaire.
 *
 * Un input vidé est transmis par Astro comme `null`, et `.default()` de zod
 * ne s'applique qu'à `undefined` : sans cette normalisation, vider un champ
 * facultatif ferait échouer la validation de tout le formulaire.
 */
export const formText = (max = 20000) =>
    z.preprocess(
        (value) => (value === null || value === undefined ? "" : value),
        z.string().max(max),
    );

/** Champ texte obligatoire, avec un message explicite si vide. */
export const requiredText = (message: string, max = 300) =>
    z.preprocess(
        (value) => (value === null || value === undefined ? "" : value),
        z.string().min(1, message).max(max),
    );

/**
 * Enveloppe un schéma de chaîne existant pour qu'un champ vide arrive en tant
 * que "" plutôt que `null`, et déclenche donc le message de validation prévu
 * (« 12 caractères minimum ») au lieu d'un « Expected string, received null ».
 */
export const nullSafe = <T extends z.ZodType<string>>(schema: T) =>
    z.preprocess(
        (value) => (value === null || value === undefined ? "" : value),
        schema,
    );

/** Construit le JSON stocké en base à partir des deux langues. */
export function packI18n(fr: string, en: string): string {
    return JSON.stringify({ fr: fr.trim(), en: en.trim() });
}

/**
 * Idem pour une liste : la saisie est une chaîne séparée par des virgules
 * (étiquettes) ou des retours à la ligne (phrases).
 */
export function packI18nList(
    fr: string,
    en: string,
    separator: "comma" | "newline" = "comma",
): string {
    const split = (value: string) =>
        value
            .split(separator === "comma" ? /[,\n]/ : /\n/)
            .map((item) => item.trim())
            .filter(Boolean);

    return JSON.stringify({ fr: split(fr), en: split(en) });
}

// ── Opérations génériques sur les listes ordonnées ────────────────────────

/** Tables acceptant les opérations de tri, visibilité et suppression. */
const ORDERABLE = new Set([
    "socials",
    "sections",
    "expertise_cards",
    "timeline_groups",
    "timeline_items",
    "projects",
]);

function assertTable(table: string): string {
    // Le nom de table est interpolé dans le SQL : il doit provenir d'une
    // liste fermée, jamais directement de l'entrée utilisateur.
    if (!ORDERABLE.has(table)) {
        throw new ActionError({
            code: "BAD_REQUEST",
            message: `Table non autorisée : ${table}`,
        });
    }
    return table;
}

export const tableSchema = z.enum([
    "socials",
    "sections",
    "expertise_cards",
    "timeline_groups",
    "timeline_items",
    "projects",
]);

export function setVisibility(table: string, id: number, visible: boolean) {
    const safe = assertTable(table);
    run(`UPDATE ${safe} SET visible = ? WHERE id = ?`, visible ? 1 : 0, id);
    invalidateContent();
}

export function deleteRow(table: string, id: number) {
    const safe = assertTable(table);
    run(`DELETE FROM ${safe} WHERE id = ?`, id);
    invalidateContent();
}

/**
 * Déplace une ligne d'un cran. Les positions sont renumérotées d'abord :
 * des valeurs égales ou trouées (après suppressions) rendraient l'échange
 * incohérent.
 */
export function moveRow(
    table: string,
    id: number,
    direction: "up" | "down",
    scope?: { column: string; value: number },
) {
    const safe = assertTable(table);

    transaction(() => {
        const where = scope ? `WHERE ${scope.column} = ?` : "";
        const params = scope ? [scope.value] : [];

        const rows = all<{ id: number }>(
            `SELECT id FROM ${safe} ${where} ORDER BY position ASC, id ASC`,
            ...params,
        );

        const index = rows.findIndex((r) => r.id === id);
        if (index === -1) return;

        const target = direction === "up" ? index - 1 : index + 1;
        if (target < 0 || target >= rows.length) return;

        [rows[index], rows[target]] = [rows[target]!, rows[index]!];

        rows.forEach((row, position) => {
            run(`UPDATE ${safe} SET position = ? WHERE id = ?`, position, row.id);
        });
    });

    invalidateContent();
}

/** Position à attribuer à un nouvel élément : à la fin de sa liste. */
export function nextPosition(
    table: string,
    scope?: { column: string; value: number },
): number {
    const safe = assertTable(table);
    const where = scope ? `WHERE ${scope.column} = ?` : "";
    const params = scope ? [scope.value] : [];

    const row = get<{ next: number | null }>(
        `SELECT MAX(position) + 1 AS next FROM ${safe} ${where}`,
        ...params,
    );
    return row?.next ?? 0;
}

/** Diacritiques isolés par la normalisation NFD (accents, cédilles…). */
const COMBINING_MARKS = /[̀-ͯ]/g;

/** Slug URL : minuscules, tirets, sans accents ni caractères spéciaux. */
export function slugify(value: string): string {
    return value
        .normalize("NFD")
        .replace(COMBINING_MARKS, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
}

/** Garantit l'unicité du slug en suffixant -2, -3… si nécessaire. */
export function uniqueSlug(base: string, excludeId?: number): string {
    const root = slugify(base) || "projet";
    let candidate = root;
    let suffix = 2;

    while (true) {
        const existing = get<{ id: number }>(
            `SELECT id FROM projects WHERE slug = ?`,
            candidate,
        );
        if (!existing || existing.id === excludeId) return candidate;
        candidate = `${root}-${suffix++}`;
    }
}

/** Convertit un identifiant de média optionnel venu d'un <select>. */
export function optionalMediaId(value: string | number | undefined | null) {
    if (value === undefined || value === null || value === "") return null;
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}
