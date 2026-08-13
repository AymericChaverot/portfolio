import {
    ActionError,
    defineAction,
    type ActionAPIContext,
} from "astro:actions";
import { z } from "astro:schema";
import { get, run } from "../lib/db";
import { invalidateContent, toHeroVisual } from "../lib/content";
import {
    changePassword,
    checkLoginRateLimit,
    clearLoginAttempts,
    clearSessionCookie,
    createAdminUser,
    createSession,
    destroySession,
    findUserByName,
    hasAdminUser,
    hashPassword,
    MIN_PASSWORD_LENGTH,
    recordFailedLogin,
    SESSION_COOKIE,
    setSessionCookie,
    verifyPassword,
} from "../lib/auth";
import {
    countMediaUsage,
    deleteMedia,
    storeUpload,
    updateMediaAlt,
    UploadError,
} from "../lib/media";
import {
    deleteRow,
    moveRow,
    nextPosition,
    optionalMediaId,
    packI18n,
    packI18nList,
    requireAuth,
    setVisibility,
    checkbox,
    formText,
    nullSafe,
    requiredText,
    tableSchema,
    uniqueSlug,
} from "./helpers";

/** Champ traduisible : deux entrées plates dans le formulaire. */
const text = formText(20000);
const shortText = formText(300);

const ok = { ok: true } as const;

/**
 * Hash jetable comparé quand l'identifiant n'existe pas, pour que le temps
 * de réponse d'un login soit le même dans tous les cas.
 */
const DUMMY_HASH = await hashPassword("$dummy-password-never-matches$");

/** Ouvre une session et pose le cookie correspondant. */
function openSession(context: ActionAPIContext, userId: number): void {
    const token = createSession(userId, {
        userAgent: context.request.headers.get("user-agent"),
        ip: context.locals.clientIp,
    });

    setSessionCookie(
        context.cookies,
        token,
        // Cookie `Secure` dès que le site est servi en HTTPS (le reverse
        // proxy transmet le protocole d'origine).
        context.url.protocol === "https:" ||
            context.request.headers.get("x-forwarded-proto") === "https",
    );
}

// ─────────────────────────────────────────────────────────────────────────
// Opérations génériques : visibilité, tri, suppression
// ─────────────────────────────────────────────────────────────────────────

const list = {
    toggleVisibility: defineAction({
        accept: "form",
        input: z.object({
            table: tableSchema,
            id: z.coerce.number().int().positive(),
            visible: checkbox,
        }),
        handler: ({ table, id, visible }, context) => {
            requireAuth(context);
            setVisibility(table, id, visible);
            return ok;
        },
    }),

    move: defineAction({
        accept: "form",
        input: z.object({
            table: tableSchema,
            id: z.coerce.number().int().positive(),
            direction: z.enum(["up", "down"]),
            /** Tri à l'intérieur d'un groupe (entrées de timeline). */
            groupId: z.coerce.number().int().positive().optional(),
        }),
        handler: ({ table, id, direction, groupId }, context) => {
            requireAuth(context);
            moveRow(
                table,
                id,
                direction,
                groupId ? { column: "group_id", value: groupId } : undefined,
            );
            return ok;
        },
    }),

    remove: defineAction({
        accept: "form",
        input: z.object({
            table: tableSchema,
            id: z.coerce.number().int().positive(),
        }),
        handler: ({ table, id }, context) => {
            requireAuth(context);

            // Les sections sont le squelette de la page d'accueil : on les
            // masque, on ne les supprime pas (aucun moyen de les recréer).
            if (table === "sections") {
                throw new ActionError({
                    code: "BAD_REQUEST",
                    message:
                        "Une section ne se supprime pas — masque-la à la place.",
                });
            }

            deleteRow(table, id);
            return ok;
        },
    }),
};

// ─────────────────────────────────────────────────────────────────────────
// Réglages du site
// ─────────────────────────────────────────────────────────────────────────

const settings = defineAction({
    accept: "form",
    input: z.object({
        name: requiredText("Le nom est requis.", 120),
        role_fr: shortText,
        role_en: shortText,
        description_fr: text,
        description_en: text,
        location: shortText,

        status_available: checkbox,
        status_text_fr: shortText,
        status_text_en: shortText,

        hero_cta_primary_fr: shortText,
        hero_cta_primary_en: shortText,
        hero_cta_secondary_fr: shortText,
        hero_cta_secondary_en: shortText,
        hero_visual: z.preprocess(
            (value) => toHeroVisual(value),
            z.enum(["terrain", "flow", "globe", "none", "terminal"]),
        ),
        hero_terminal_title: shortText,
        hero_terminal_code_fr: text,
        hero_terminal_code_en: text,

        contact_send_email_fr: shortText,
        contact_send_email_en: shortText,

        footer_text_fr: shortText,
        footer_text_en: shortText,
        footer_subtext_fr: shortText,
        footer_subtext_en: shortText,

        seo_title_fr: shortText,
        seo_title_en: shortText,
        seo_description_fr: text,
        seo_description_en: text,
        og_image_id: formText(20),

        theme_color: z.preprocess(
            (value) => (value === null || value === undefined || value === "" ? "#f48c25" : value),
            z
                .string()
                .regex(
                    /^#[0-9a-fA-F]{6}$/,
                    "Couleur hexadécimale attendue (#rrggbb).",
                ),
        ),
        default_lang: z.preprocess(
            (value) => (value === "en" ? "en" : "fr"),
            z.enum(["fr", "en"]),
        ),
        resume_enabled: checkbox,
        resume_pdf_id: formText(20),
    }),
    handler: (input, context) => {
        requireAuth(context);

        run(
            `UPDATE site_settings SET
                name = ?, role = ?, description = ?, location = ?,
                status_available = ?, status_text = ?,
                hero_cta_primary = ?, hero_cta_secondary = ?,
                hero_visual = ?,
                hero_terminal_title = ?, hero_terminal_code = ?,
                contact_send_email = ?,
                footer_text = ?, footer_subtext = ?,
                seo_title = ?, seo_description = ?, og_image_id = ?,
                theme_color = ?, default_lang = ?,
                resume_enabled = ?, resume_pdf_id = ?,
                updated_at = datetime('now')
             WHERE id = 1`,
            input.name.trim(),
            packI18n(input.role_fr, input.role_en),
            packI18n(input.description_fr, input.description_en),
            input.location.trim(),
            input.status_available,
            packI18n(input.status_text_fr, input.status_text_en),
            packI18n(input.hero_cta_primary_fr, input.hero_cta_primary_en),
            packI18n(input.hero_cta_secondary_fr, input.hero_cta_secondary_en),
            input.hero_visual,
            input.hero_terminal_title.trim() || "profile.rs",
            packI18n(input.hero_terminal_code_fr, input.hero_terminal_code_en),
            packI18n(input.contact_send_email_fr, input.contact_send_email_en),
            packI18n(input.footer_text_fr, input.footer_text_en),
            packI18n(input.footer_subtext_fr, input.footer_subtext_en),
            packI18n(input.seo_title_fr, input.seo_title_en),
            packI18n(input.seo_description_fr, input.seo_description_en),
            optionalMediaId(input.og_image_id),
            input.theme_color,
            input.default_lang,
            input.resume_enabled,
            optionalMediaId(input.resume_pdf_id),
        );

        invalidateContent();
        return ok;
    },
});

// ─────────────────────────────────────────────────────────────────────────
// Sections de la page d'accueil
// ─────────────────────────────────────────────────────────────────────────

const section = defineAction({
    accept: "form",
    input: z.object({
        id: z.coerce.number().int().positive(),
        nav_label_fr: shortText,
        nav_label_en: shortText,
        eyebrow_fr: shortText,
        eyebrow_en: shortText,
        heading_fr: shortText,
        heading_en: shortText,
        subheading_fr: text,
        subheading_en: text,
        cta_label_fr: shortText,
        cta_label_en: shortText,
        in_nav: checkbox,
        visible: checkbox,
    }),
    handler: (input, context) => {
        requireAuth(context);

        run(
            `UPDATE sections SET
                nav_label = ?, eyebrow = ?, heading = ?, subheading = ?,
                cta_label = ?, in_nav = ?, visible = ?
             WHERE id = ?`,
            packI18n(input.nav_label_fr, input.nav_label_en),
            packI18n(input.eyebrow_fr, input.eyebrow_en),
            packI18n(input.heading_fr, input.heading_en),
            packI18n(input.subheading_fr, input.subheading_en),
            packI18n(input.cta_label_fr, input.cta_label_en),
            input.in_nav,
            input.visible,
            input.id,
        );

        invalidateContent();
        return ok;
    },
});

// ─────────────────────────────────────────────────────────────────────────
// Réseaux sociaux
// ─────────────────────────────────────────────────────────────────────────

const social = defineAction({
    accept: "form",
    input: z.object({
        id: z.coerce.number().int().positive().optional(),
        name: requiredText("Le nom est requis.", 60),
        url: requiredText("L'URL est requise.", 500),
        icon: formText(60),
        visible: checkbox,
    }),
    handler: (input, context) => {
        requireAuth(context);

        const url = input.url.trim();
        // Un lien de contact peut être http(s) ou mailto/tel : on refuse le
        // reste (javascript:, data:) qui n'a rien à faire dans un href.
        if (!/^(https?:\/\/|mailto:|tel:)/i.test(url)) {
            throw new ActionError({
                code: "BAD_REQUEST",
                message:
                    "L'URL doit commencer par https://, http://, mailto: ou tel:",
            });
        }

        if (input.id) {
            run(
                `UPDATE socials SET name = ?, url = ?, icon = ?, visible = ? WHERE id = ?`,
                input.name.trim(),
                url,
                input.icon.trim() || "link",
                input.visible,
                input.id,
            );
        } else {
            run(
                `INSERT INTO socials (name, url, icon, position, visible)
                 VALUES (?, ?, ?, ?, ?)`,
                input.name.trim(),
                url,
                input.icon.trim() || "link",
                nextPosition("socials"),
                input.visible,
            );
        }

        invalidateContent();
        return ok;
    },
});

// ─────────────────────────────────────────────────────────────────────────
// Cartes d'expertise
// ─────────────────────────────────────────────────────────────────────────

const expertise = defineAction({
    accept: "form",
    input: z.object({
        id: z.coerce.number().int().positive().optional(),
        icon: formText(60),
        title_fr: shortText,
        title_en: shortText,
        description_fr: text,
        description_en: text,
        skills_fr: text,
        skills_en: text,
        visible: checkbox,
    }),
    handler: (input, context) => {
        requireAuth(context);

        const values = [
            input.icon.trim() || "code",
            packI18n(input.title_fr, input.title_en),
            packI18n(input.description_fr, input.description_en),
            packI18nList(input.skills_fr, input.skills_en),
            input.visible,
        ];

        if (input.id) {
            run(
                `UPDATE expertise_cards SET
                    icon = ?, title = ?, description = ?, skills = ?, visible = ?
                 WHERE id = ?`,
                ...values,
                input.id,
            );
        } else {
            run(
                `INSERT INTO expertise_cards
                    (icon, title, description, skills, visible, position)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                ...values,
                nextPosition("expertise_cards"),
            );
        }

        invalidateContent();
        return ok;
    },
});

// ─────────────────────────────────────────────────────────────────────────
// Timeline : groupes et entrées
// ─────────────────────────────────────────────────────────────────────────

const timelineGroup = defineAction({
    accept: "form",
    input: z.object({
        id: z.coerce.number().int().positive().optional(),
        eyebrow_fr: shortText,
        eyebrow_en: shortText,
        heading_fr: shortText,
        heading_en: shortText,
        side: z.enum(["left", "right"]).default("left"),
        visible: checkbox,
    }),
    handler: (input, context) => {
        requireAuth(context);

        const values = [
            packI18n(input.eyebrow_fr, input.eyebrow_en),
            packI18n(input.heading_fr, input.heading_en),
            input.side,
            input.visible,
        ];

        if (input.id) {
            run(
                `UPDATE timeline_groups SET
                    eyebrow = ?, heading = ?, side = ?, visible = ?
                 WHERE id = ?`,
                ...values,
                input.id,
            );
        } else {
            run(
                `INSERT INTO timeline_groups (eyebrow, heading, side, visible, position)
                 VALUES (?, ?, ?, ?, ?)`,
                ...values,
                nextPosition("timeline_groups"),
            );
        }

        invalidateContent();
        return ok;
    },
});

const timelineItem = defineAction({
    accept: "form",
    input: z.object({
        id: z.coerce.number().int().positive().optional(),
        group_id: z.coerce.number().int().positive(),
        company: requiredText("L'organisation est requise.", 160),
        role_fr: shortText,
        role_en: shortText,
        period_fr: shortText,
        period_en: shortText,
        location: shortText,
        description_fr: text,
        description_en: text,
        tags_fr: text,
        tags_en: text,
        icon: formText(60),
        is_current: checkbox,
        badge_fr: shortText,
        badge_en: shortText,
        logo_id: formText(20),
        visible: checkbox,
    }),
    handler: (input, context) => {
        requireAuth(context);

        const group = get<{ id: number }>(
            `SELECT id FROM timeline_groups WHERE id = ?`,
            input.group_id,
        );
        if (!group) {
            throw new ActionError({
                code: "BAD_REQUEST",
                message: "Groupe de timeline introuvable.",
            });
        }

        const values = [
            input.group_id,
            input.company.trim(),
            packI18n(input.role_fr, input.role_en),
            packI18n(input.period_fr, input.period_en),
            input.location.trim(),
            packI18n(input.description_fr, input.description_en),
            packI18nList(input.tags_fr, input.tags_en),
            input.icon.trim() || "work",
            input.is_current,
            packI18n(input.badge_fr, input.badge_en),
            optionalMediaId(input.logo_id),
            input.visible,
        ];

        if (input.id) {
            run(
                `UPDATE timeline_items SET
                    group_id = ?, company = ?, role = ?, period = ?, location = ?,
                    description = ?, tags = ?, icon = ?, is_current = ?, badge = ?,
                    logo_id = ?, visible = ?
                 WHERE id = ?`,
                ...values,
                input.id,
            );
        } else {
            run(
                `INSERT INTO timeline_items
                    (group_id, company, role, period, location, description, tags,
                     icon, is_current, badge, logo_id, visible, position)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                ...values,
                nextPosition("timeline_items", {
                    column: "group_id",
                    value: input.group_id,
                }),
            );
        }

        invalidateContent();
        return ok;
    },
});

// ─────────────────────────────────────────────────────────────────────────
// Projets
// ─────────────────────────────────────────────────────────────────────────

const project = defineAction({
    accept: "form",
    input: z.object({
        id: z.coerce.number().int().positive().optional(),
        slug: formText(80),
        title: requiredText("Le titre est requis.", 160),
        description_fr: text,
        description_en: text,
        full_description_fr: text,
        full_description_en: text,
        architecture_fr: text,
        architecture_en: text,
        tags_fr: text,
        tags_en: text,
        image_id: formText(20),
        image_alt_fr: shortText,
        image_alt_en: shortText,
        badge_fr: shortText,
        badge_en: shortText,
        status_text_fr: shortText,
        status_text_en: shortText,
        action_type: z.enum(["source", "info", "visit"]).default("info"),
        action_url: formText(500),
        featured: checkbox,
        visible: checkbox,
    }),
    handler: (input, context) => {
        requireAuth(context);

        const actionUrl = input.action_url.trim();
        if (actionUrl && !/^https?:\/\//i.test(actionUrl)) {
            throw new ActionError({
                code: "BAD_REQUEST",
                message: "Le lien du projet doit commencer par https:// ou http://",
            });
        }

        // Un type « source » ou « visit » sans URL produirait un bouton mort
        // sur la fiche projet — exactement le défaut qu'on corrige.
        if (input.action_type !== "info" && !actionUrl) {
            throw new ActionError({
                code: "BAD_REQUEST",
                message:
                    'Ce type d\'action nécessite une URL. Choisis « Informations » si le projet n\'a pas de lien public.',
            });
        }

        const slug = uniqueSlug(input.slug || input.title, input.id);

        const values = [
            slug,
            input.title.trim(),
            packI18n(input.description_fr, input.description_en),
            packI18n(input.full_description_fr, input.full_description_en),
            packI18n(input.architecture_fr, input.architecture_en),
            packI18nList(input.tags_fr, input.tags_en),
            optionalMediaId(input.image_id),
            packI18n(input.image_alt_fr, input.image_alt_en),
            packI18n(input.badge_fr, input.badge_en),
            packI18n(input.status_text_fr, input.status_text_en),
            input.action_type,
            actionUrl || null,
            input.featured,
            input.visible,
        ];

        let id = input.id;

        if (id) {
            run(
                `UPDATE projects SET
                    slug = ?, title = ?, description = ?, full_description = ?,
                    architecture = ?, tags = ?, image_id = ?, image_alt = ?,
                    badge = ?, status_text = ?, action_type = ?, action_url = ?,
                    featured = ?, visible = ?, updated_at = datetime('now')
                 WHERE id = ?`,
                ...values,
                id,
            );
        } else {
            const result = run(
                `INSERT INTO projects
                    (slug, title, description, full_description, architecture, tags,
                     image_id, image_alt, badge, status_text, action_type, action_url,
                     featured, visible, position)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                ...values,
                nextPosition("projects"),
            );
            id = Number(result.lastInsertRowid);
        }

        invalidateContent();
        return { ok: true, id, slug };
    },
});

// ─────────────────────────────────────────────────────────────────────────
// Médias
// ─────────────────────────────────────────────────────────────────────────

const media = {
    upload: defineAction({
        accept: "form",
        input: z.object({
            file: z.instanceof(File, { message: "Aucun fichier sélectionné." }),
        }),
        handler: async ({ file }, context) => {
            requireAuth(context);
            try {
                return { ok: true, ...(await storeUpload(file)) };
            } catch (error) {
                if (error instanceof UploadError) {
                    throw new ActionError({
                        code: "BAD_REQUEST",
                        message: error.message,
                    });
                }
                throw error;
            }
        },
    }),

    updateAlt: defineAction({
        accept: "form",
        input: z.object({
            id: z.coerce.number().int().positive(),
            alt_fr: shortText,
            alt_en: shortText,
        }),
        handler: ({ id, alt_fr, alt_en }, context) => {
            requireAuth(context);
            updateMediaAlt(id, packI18n(alt_fr, alt_en));
            return ok;
        },
    }),

    remove: defineAction({
        accept: "form",
        input: z.object({
            id: z.coerce.number().int().positive(),
            force: checkbox,
        }),
        handler: async ({ id, force }, context) => {
            requireAuth(context);

            const usage = countMediaUsage(id);
            if (usage > 0 && !force) {
                throw new ActionError({
                    code: "CONFLICT",
                    message: `Ce fichier est utilisé par ${usage} élément(s). Confirme pour le supprimer quand même.`,
                });
            }

            await deleteMedia(id);
            return ok;
        },
    }),
};

// ─────────────────────────────────────────────────────────────────────────
// Compte
// ─────────────────────────────────────────────────────────────────────────

const account = {
    setup: defineAction({
        accept: "form",
        input: z
            .object({
                username: nullSafe(
                    z
                        .string()
                        .min(3, "3 caractères minimum.")
                        .max(60)
                        .regex(
                            /^[a-zA-Z0-9._-]+$/,
                            "Lettres, chiffres, point, tiret et souligné uniquement.",
                        ),
                ),
                password: nullSafe(
                    z
                        .string()
                        .min(
                            MIN_PASSWORD_LENGTH,
                            `${MIN_PASSWORD_LENGTH} caractères minimum.`,
                        )
                        .max(200),
                ),
                confirm: formText(200),
            })
            .refine((data) => data.password === data.confirm, {
                message: "Les mots de passe ne correspondent pas.",
                path: ["confirm"],
            }),
        handler: async ({ username, password }, context) => {
            // Course au premier arrivé : si un compte existe déjà, la page de
            // création n'est plus légitime, même si le formulaire a été gardé
            // ouvert dans un onglet.
            if (hasAdminUser()) {
                throw new ActionError({
                    code: "FORBIDDEN",
                    message: "Un compte administrateur existe déjà.",
                });
            }

            const id = await createAdminUser(username.trim(), password);

            // Connexion immédiate : inutile de faire retaper le mot de passe
            // qui vient d'être choisi.
            openSession(context, id);
            return ok;
        },
    }),

    login: defineAction({
        accept: "form",
        input: z.object({
            username: requiredText("Identifiant requis.", 60),
            password: requiredText("Mot de passe requis.", 200),
        }),
        handler: async ({ username, password }, context) => {
            const ip = context.locals.clientIp || "unknown";

            const limit = checkLoginRateLimit(ip);
            if (limit.locked) {
                throw new ActionError({
                    code: "TOO_MANY_REQUESTS",
                    message: `Trop de tentatives. Réessaie dans ${Math.ceil(
                        limit.retryAfterSeconds / 60,
                    )} minute(s).`,
                });
            }

            const user = findUserByName(username.trim());

            // On vérifie le mot de passe même sans utilisateur trouvé, contre
            // un hash factice : sinon le temps de réponse révélerait quels
            // identifiants existent.
            const valid = await verifyPassword(
                password,
                user?.password_hash ?? DUMMY_HASH,
            );

            if (!user || !valid) {
                const state = recordFailedLogin(ip);
                throw new ActionError({
                    code: "UNAUTHORIZED",
                    message: state.locked
                        ? "Trop de tentatives. Compte temporairement bloqué."
                        : `Identifiants incorrects. ${state.remaining} tentative(s) restante(s).`,
                });
            }

            clearLoginAttempts(ip);
            run(`UPDATE admin_users SET last_login_at = ? WHERE id = ?`, Date.now(), user.id);
            openSession(context, user.id);

            return ok;
        },
    }),

    logout: defineAction({
        accept: "form",
        input: z.object({}).optional(),
        handler: (_input, context) => {
            destroySession(context.cookies.get(SESSION_COOKIE)?.value);
            clearSessionCookie(context.cookies);
            return ok;
        },
    }),

    changePassword: defineAction({
        accept: "form",
        input: z
            .object({
                current: requiredText("Mot de passe actuel requis.", 200),
                password: nullSafe(
                    z
                        .string()
                        .min(
                            MIN_PASSWORD_LENGTH,
                            `${MIN_PASSWORD_LENGTH} caractères minimum.`,
                        )
                        .max(200),
                ),
                confirm: formText(200),
            })
            .refine((data) => data.password === data.confirm, {
                message: "Les mots de passe ne correspondent pas.",
                path: ["confirm"],
            }),
        handler: async ({ current, password }, context) => {
            const user = requireAuth(context);

            if (!(await verifyPassword(current, user.password_hash))) {
                throw new ActionError({
                    code: "UNAUTHORIZED",
                    message: "Mot de passe actuel incorrect.",
                });
            }

            await changePassword(user.id, password);
            return ok;
        },
    }),
};

export const server = {
    list,
    settings,
    section,
    social,
    expertise,
    timelineGroup,
    timelineItem,
    project,
    media,
    account,
};
