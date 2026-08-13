import { all, get } from "./db";
import { pick, pickList, type Lang } from "./i18n";

// ─────────────────────────────────────────────────────────────────────────
// Types résolus : ce que consomment les composants, déjà traduits pour une
// langue donnée. Les composants n'ont jamais à manipuler de JSON i18n.
// ─────────────────────────────────────────────────────────────────────────

export interface MediaRef {
    id: number;
    url: string;
    width: number | null;
    height: number | null;
    alt: string;
}

/** Visuel affiché à droite du titre du hero. */
export type HeroVisual = "terrain" | "flow" | "globe" | "none" | "terminal";

export const HERO_VISUALS: readonly HeroVisual[] = [
    "terrain",
    "flow",
    "globe",
    "none",
    "terminal",
] as const;

/**
 * Normalise la valeur stockée. `graph` était le nom du visuel remplacé par
 * le relief : on le traite en alias plutôt que de migrer les bases.
 */
export function toHeroVisual(value: unknown): HeroVisual {
    if (value === "graph") return "terrain";
    return HERO_VISUALS.includes(value as HeroVisual)
        ? (value as HeroVisual)
        : "terrain";
}

export interface SiteSettings {
    name: string;
    role: string;
    description: string;
    location: string;
    statusAvailable: boolean;
    statusText: string;
    heroCtaPrimary: string;
    heroCtaSecondary: string;
    heroVisual: HeroVisual;
    heroTerminalTitle: string;
    heroTerminalCode: string;
    contactSendEmail: string;
    footerText: string;
    footerSubtext: string;
    seoTitle: string;
    seoDescription: string;
    ogImage: MediaRef | null;
    themeColor: string;
    defaultLang: Lang;
    resumeEnabled: boolean;
    resumePdf: MediaRef | null;
}

export interface Social {
    id: number;
    name: string;
    url: string;
    icon: string;
}

export type SectionKey =
    | "hero"
    | "expertise"
    | "experience"
    | "projects"
    | "contact";

export interface Section {
    id: number;
    key: SectionKey;
    navLabel: string;
    eyebrow: string;
    heading: string;
    subheading: string;
    ctaLabel: string;
    position: number;
    visible: boolean;
    inNav: boolean;
}

export interface ExpertiseCard {
    id: number;
    icon: string;
    title: string;
    description: string;
    skills: string[];
}

export interface TimelineItem {
    id: number;
    company: string;
    role: string;
    period: string;
    location: string;
    description: string;
    tags: string[];
    icon: string;
    isCurrent: boolean;
    badge: string;
    logo: MediaRef | null;
}

export interface TimelineGroup {
    id: number;
    eyebrow: string;
    heading: string;
    side: "left" | "right";
    items: TimelineItem[];
}

export type ProjectAction = "source" | "info" | "visit";

export interface Project {
    id: number;
    slug: string;
    title: string;
    description: string;
    fullDescription: string;
    architecture: string;
    tags: string[];
    image: MediaRef | null;
    imageAlt: string;
    badge: string;
    statusText: string;
    actionType: ProjectAction;
    actionUrl: string | null;
    featured: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
// Cache mémoire
//
// Les lectures SQLite sont déjà de l'ordre de la microseconde ; ce cache
// évite surtout de re-parser le JSON i18n à chaque requête. Toute écriture
// admin appelle `invalidateContent()`, ce qui rend les modifications
// visibles immédiatement.
// ─────────────────────────────────────────────────────────────────────────

let version = 0;
const cache = new Map<string, { version: number; value: unknown }>();

export function invalidateContent(): void {
    version += 1;
    cache.clear();
}

export function contentVersion(): number {
    return version;
}

function cached<T>(key: string, compute: () => T): T {
    const hit = cache.get(key);
    if (hit && hit.version === version) return hit.value as T;
    const value = compute();
    cache.set(key, { version, value });
    return value;
}

// ── Média ─────────────────────────────────────────────────────────────────

export function mediaUrl(filename: string): string {
    return `/media/${filename}`;
}

interface MediaColumns {
    media_id: number | null;
    media_filename: string | null;
    media_width: number | null;
    media_height: number | null;
    media_alt: string | null;
}

/** Colonnes à sélectionner pour reconstruire un MediaRef depuis un LEFT JOIN. */
const MEDIA_SELECT = `
    m.id       AS media_id,
    m.filename AS media_filename,
    m.width    AS media_width,
    m.height   AS media_height,
    m.alt      AS media_alt`;

function toMedia(row: MediaColumns, lang: Lang): MediaRef | null {
    if (!row.media_id || !row.media_filename) return null;
    return {
        id: row.media_id,
        url: mediaUrl(row.media_filename),
        width: row.media_width,
        height: row.media_height,
        alt: pick(row.media_alt, lang),
    };
}

// ── Réglages ──────────────────────────────────────────────────────────────

const FALLBACK_SETTINGS: SiteSettings = {
    name: "Portfolio",
    role: "",
    description: "",
    location: "",
    statusAvailable: false,
    statusText: "",
    heroCtaPrimary: "",
    heroCtaSecondary: "",
    heroVisual: "terrain",
    heroTerminalTitle: "profile.rs",
    heroTerminalCode: "",
    contactSendEmail: "",
    footerText: "",
    footerSubtext: "",
    seoTitle: "",
    seoDescription: "",
    ogImage: null,
    themeColor: "#f48c25",
    defaultLang: "fr",
    resumeEnabled: false,
    resumePdf: null,
};

export function getSettings(lang: Lang): SiteSettings {
    return cached(`settings:${lang}`, () => {
        const row = get<Record<string, any>>(`
            SELECT s.*,
                   og.filename AS og_filename,
                   og.width    AS og_width,
                   og.height   AS og_height,
                   og.alt      AS og_alt,
                   pdf.filename AS pdf_filename
            FROM site_settings s
            LEFT JOIN media og  ON og.id  = s.og_image_id
            LEFT JOIN media pdf ON pdf.id = s.resume_pdf_id
            WHERE s.id = 1
        `);

        if (!row) return FALLBACK_SETTINGS;

        return {
            name: row.name || FALLBACK_SETTINGS.name,
            role: pick(row.role, lang),
            description: pick(row.description, lang),
            location: row.location || "",
            statusAvailable: Boolean(row.status_available),
            statusText: pick(row.status_text, lang),
            heroCtaPrimary: pick(row.hero_cta_primary, lang),
            heroCtaSecondary: pick(row.hero_cta_secondary, lang),
            heroVisual: toHeroVisual(row.hero_visual),
            heroTerminalTitle: row.hero_terminal_title || "profile.rs",
            heroTerminalCode: pick(row.hero_terminal_code, lang),
            contactSendEmail: pick(row.contact_send_email, lang),
            footerText: pick(row.footer_text, lang),
            footerSubtext: pick(row.footer_subtext, lang),
            seoTitle: pick(row.seo_title, lang),
            seoDescription: pick(row.seo_description, lang),
            ogImage: row.og_filename
                ? {
                      id: row.og_image_id,
                      url: mediaUrl(row.og_filename),
                      width: row.og_width,
                      height: row.og_height,
                      alt: pick(row.og_alt, lang),
                  }
                : null,
            themeColor: row.theme_color || "#f48c25",
            defaultLang: row.default_lang === "en" ? "en" : "fr",
            resumeEnabled: Boolean(row.resume_enabled),
            resumePdf: row.pdf_filename
                ? {
                      id: row.resume_pdf_id,
                      url: mediaUrl(row.pdf_filename),
                      width: null,
                      height: null,
                      alt: "",
                  }
                : null,
        };
    });
}

// ── Réseaux sociaux ───────────────────────────────────────────────────────

export function getSocials(): Social[] {
    return cached("socials", () =>
        all<Record<string, any>>(`
            SELECT id, name, url, icon
            FROM socials
            WHERE visible = 1
            ORDER BY position ASC, id ASC
        `).map((r) => ({
            id: r.id,
            name: r.name,
            url: r.url,
            icon: r.icon || "link",
        })),
    );
}

// ── Sections ──────────────────────────────────────────────────────────────

export function getSections(lang: Lang): Section[] {
    return cached(`sections:${lang}`, () =>
        all<Record<string, any>>(`
            SELECT * FROM sections
            WHERE visible = 1
            ORDER BY position ASC, id ASC
        `).map((r) => ({
            id: r.id,
            key: r.key as SectionKey,
            navLabel: pick(r.nav_label, lang),
            eyebrow: pick(r.eyebrow, lang),
            heading: pick(r.heading, lang),
            subheading: pick(r.subheading, lang),
            ctaLabel: pick(r.cta_label, lang),
            position: r.position,
            visible: Boolean(r.visible),
            inNav: Boolean(r.in_nav),
        })),
    );
}

/** Section unique par clé — renvoie undefined si masquée ou absente. */
export function getSection(lang: Lang, key: SectionKey): Section | undefined {
    return getSections(lang).find((s) => s.key === key);
}

// ── Expertise ─────────────────────────────────────────────────────────────

export function getExpertiseCards(lang: Lang): ExpertiseCard[] {
    return cached(`expertise:${lang}`, () =>
        all<Record<string, any>>(`
            SELECT * FROM expertise_cards
            WHERE visible = 1
            ORDER BY position ASC, id ASC
        `).map((r) => ({
            id: r.id,
            icon: r.icon || "code",
            title: pick(r.title, lang),
            description: pick(r.description, lang),
            skills: pickList(r.skills, lang),
        })),
    );
}

// ── Timeline ──────────────────────────────────────────────────────────────

export function getTimelineGroups(lang: Lang): TimelineGroup[] {
    return cached(`timeline:${lang}`, () => {
        const groups = all<Record<string, any>>(`
            SELECT * FROM timeline_groups
            WHERE visible = 1
            ORDER BY position ASC, id ASC
        `);

        const items = all<Record<string, any>>(`
            SELECT t.*, ${MEDIA_SELECT}
            FROM timeline_items t
            LEFT JOIN media m ON m.id = t.logo_id
            WHERE t.visible = 1
            ORDER BY t.position ASC, t.id ASC
        `);

        return groups
            .map((g) => ({
                id: g.id,
                eyebrow: pick(g.eyebrow, lang),
                heading: pick(g.heading, lang),
                side: (g.side === "right" ? "right" : "left") as "left" | "right",
                items: items
                    .filter((i) => i.group_id === g.id)
                    .map((i) => ({
                        id: i.id,
                        company: i.company,
                        role: pick(i.role, lang),
                        period: pick(i.period, lang),
                        location: i.location || "",
                        description: pick(i.description, lang),
                        tags: pickList(i.tags, lang),
                        icon: i.icon || "work",
                        isCurrent: Boolean(i.is_current),
                        badge: pick(i.badge, lang),
                        logo: toMedia(i as MediaColumns, lang),
                    })),
            }))
            // Un groupe dont tous les éléments sont masqués ne doit pas
            // laisser un titre orphelin ni casser le tracé de la timeline.
            .filter((g) => g.items.length > 0);
    });
}

// ── Projets ───────────────────────────────────────────────────────────────

function mapProject(r: Record<string, any>, lang: Lang): Project {
    return {
        id: r.id,
        slug: r.slug,
        title: r.title,
        description: pick(r.description, lang),
        fullDescription: pick(r.full_description, lang),
        architecture: pick(r.architecture, lang),
        tags: pickList(r.tags, lang),
        image: toMedia(r as MediaColumns, lang),
        imageAlt: pick(r.image_alt, lang),
        badge: pick(r.badge, lang),
        statusText: pick(r.status_text, lang),
        actionType: (r.action_type || "info") as ProjectAction,
        actionUrl: r.action_url || null,
        featured: Boolean(r.featured),
    };
}

const PROJECT_QUERY = `
    SELECT p.*, ${MEDIA_SELECT}
    FROM projects p
    LEFT JOIN media m ON m.id = p.image_id
    WHERE p.visible = 1`;

/** Tous les projets visibles (page /projects). */
export function getProjects(lang: Lang): Project[] {
    return cached(`projects:${lang}`, () =>
        all<Record<string, any>>(
            `${PROJECT_QUERY} ORDER BY p.position ASC, p.id ASC`,
        ).map((r) => mapProject(r, lang)),
    );
}

/** Projets mis en avant (accueil). */
export function getFeaturedProjects(lang: Lang): Project[] {
    return cached(`projects:featured:${lang}`, () =>
        getProjects(lang).filter((p) => p.featured),
    );
}

export function getProject(lang: Lang, slug: string): Project | undefined {
    const row = get<Record<string, any>>(
        `${PROJECT_QUERY} AND p.slug = ?`,
        slug,
    );
    return row ? mapProject(row, lang) : undefined;
}

/** Toutes les étiquettes présentes sur les projets visibles, dédupliquées. */
export function getProjectTags(lang: Lang): string[] {
    return cached(`projects:tags:${lang}`, () => {
        const seen = new Set<string>();
        for (const project of getProjects(lang)) {
            for (const tag of project.tags) seen.add(tag);
        }
        return [...seen].sort((a, b) => a.localeCompare(b, lang));
    });
}
