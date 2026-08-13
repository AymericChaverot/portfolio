/**
 * Coloration syntaxique minimale de type Rust pour le terminal du hero.
 *
 * L'admin saisit du code brut dans un textarea : on ne stocke jamais de HTML
 * en base, ce qui évite toute injection. Tout ce qui n'est pas reconnu reste
 * affiché tel quel, en gris — la dégradation est propre pour un autre langage.
 */

const KEYWORDS = new Set([
    "as", "async", "await", "box", "break", "const", "continue", "crate",
    "dyn", "else", "enum", "extern", "false", "fn", "for", "if", "impl",
    "in", "let", "loop", "match", "mod", "move", "mut", "pub", "ref",
    "return", "self", "Self", "static", "struct", "super", "trait", "true",
    "type", "unsafe", "use", "where", "while",
]);

const ESCAPES: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
};

function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

function span(cls: string, text: string): string {
    return `<span class="${cls}">${escapeHtml(text)}</span>`;
}

/**
 * Un seul passage, alternatives ordonnées par priorité : les commentaires et
 * chaînes gagnent sur tout le reste pour qu'un mot-clé à l'intérieur d'une
 * chaîne ne soit pas coloré.
 */
const TOKEN = new RegExp(
    [
        "(?<comment>//[^\\n]*)",
        '(?<string>"(?:[^"\\\\\\n]|\\\\.)*"|\'(?:[^\'\\\\\\n]|\\\\.)*\')',
        "(?<macro>[A-Za-z_][A-Za-z0-9_]*!)",
        "(?<number>\\b\\d[\\d_]*(?:\\.\\d+)?(?:[iuf](?:8|16|32|64|size))?\\b)",
        "(?<ident>[A-Za-z_][A-Za-z0-9_]*)",
        "(?<punct>[{}()\\[\\];])",
        "(?<attr>#!?\\[[^\\]\\n]*\\])",
    ].join("|"),
    "g",
);

/** Transforme une ligne de code en HTML coloré (déjà échappé). */
export function highlightLine(line: string): string {
    let out = "";
    let last = 0;

    for (const match of line.matchAll(TOKEN)) {
        const groups = match.groups!;
        const index = match.index!;

        // Texte non reconnu entre deux tokens (opérateurs, espaces, virgules)
        if (index > last) out += escapeHtml(line.slice(last, index));
        last = index + match[0].length;

        if (groups.comment !== undefined) {
            out += span("text-gray-600 italic", groups.comment);
        } else if (groups.string !== undefined) {
            out += span("text-green-400", groups.string);
        } else if (groups.attr !== undefined) {
            out += span("text-purple-300", groups.attr);
        } else if (groups.macro !== undefined) {
            out += span("text-blue-300", groups.macro);
        } else if (groups.number !== undefined) {
            out += span("text-purple-300", groups.number);
        } else if (groups.punct !== undefined) {
            out += span("text-white", groups.punct);
        } else if (groups.ident !== undefined) {
            const ident = groups.ident;
            const rest = line.slice(last);

            if (KEYWORDS.has(ident)) {
                out += span("text-primary", ident);
            } else if (/^\s*\(/.test(rest)) {
                // Identifiant suivi d'une parenthèse → appel de fonction
                out += span("text-blue-300", ident);
            } else if (/^[A-Z]/.test(ident)) {
                out += span("text-yellow-200", ident);
            } else {
                out += escapeHtml(ident);
            }
        }
    }

    if (last < line.length) out += escapeHtml(line.slice(last));
    return out;
}

export interface HighlightedLine {
    number: number;
    html: string;
}

/** Découpe un bloc de code en lignes numérotées et colorées. */
export function highlightCode(code: string): HighlightedLine[] {
    return code
        .replace(/\r\n/g, "\n")
        .replace(/\s+$/, "")
        .split("\n")
        .map((line, i) => ({ number: i + 1, html: highlightLine(line) }));
}
