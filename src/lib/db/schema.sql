-- ─────────────────────────────────────────────────────────────────────────
-- Schéma du portfolio.
--
-- Convention i18n : les colonnes traduisibles stockent un objet JSON
-- {"fr": "...", "en": "..."} et sont résolues à la lecture par `pick()`.
-- Les noms propres (nom, entreprise, ville, URL) restent des TEXT simples.
--
-- Convention listes : `position` donne l'ordre d'affichage (croissant),
-- `visible` (0/1) permet de masquer un élément sans le supprimer.
-- ─────────────────────────────────────────────────────────────────────────

-- ── Médias ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS media (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    filename      TEXT    NOT NULL UNIQUE,      -- nom sur disque
    original_name TEXT    NOT NULL,
    mime          TEXT    NOT NULL,
    size          INTEGER NOT NULL,
    width         INTEGER,
    height        INTEGER,
    alt           TEXT    NOT NULL DEFAULT '{}', -- i18n
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── Réglages du site (ligne unique) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_settings (
    id                     INTEGER PRIMARY KEY CHECK (id = 1),
    name                   TEXT NOT NULL DEFAULT '',
    role                   TEXT NOT NULL DEFAULT '{}', -- i18n
    description            TEXT NOT NULL DEFAULT '{}', -- i18n
    location               TEXT NOT NULL DEFAULT '',

    status_available       INTEGER NOT NULL DEFAULT 0,
    status_text            TEXT NOT NULL DEFAULT '{}', -- i18n

    -- Hero
    hero_cta_primary       TEXT NOT NULL DEFAULT '{}', -- i18n
    hero_cta_secondary     TEXT NOT NULL DEFAULT '{}', -- i18n
    hero_terminal_title    TEXT NOT NULL DEFAULT 'profile.rs — neovim',
    hero_terminal_code     TEXT NOT NULL DEFAULT '{}', -- i18n, code brut

    -- Contact
    contact_user           TEXT NOT NULL DEFAULT 'guest',
    contact_command        TEXT NOT NULL DEFAULT './contact_me.sh',
    contact_lines          TEXT NOT NULL DEFAULT '{}', -- i18n -> string[]
    contact_send_email     TEXT NOT NULL DEFAULT '{}', -- i18n

    -- Pied de page
    footer_text            TEXT NOT NULL DEFAULT '{}', -- i18n
    footer_subtext         TEXT NOT NULL DEFAULT '{}', -- i18n

    -- SEO
    seo_title              TEXT NOT NULL DEFAULT '{}', -- i18n
    seo_description        TEXT NOT NULL DEFAULT '{}', -- i18n
    og_image_id            INTEGER REFERENCES media(id) ON DELETE SET NULL,
    theme_color            TEXT NOT NULL DEFAULT '#f48c25',

    -- Divers
    default_lang           TEXT NOT NULL DEFAULT 'fr' CHECK (default_lang IN ('fr','en')),
    resume_enabled         INTEGER NOT NULL DEFAULT 1,
    resume_pdf_id          INTEGER REFERENCES media(id) ON DELETE SET NULL,
    updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Réseaux sociaux / liens de contact ────────────────────────────────────
CREATE TABLE IF NOT EXISTS socials (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name     TEXT    NOT NULL,
    url      TEXT    NOT NULL,
    icon     TEXT    NOT NULL DEFAULT 'link',
    position INTEGER NOT NULL DEFAULT 0,
    visible  INTEGER NOT NULL DEFAULT 1
);

-- ── Sections de la page d'accueil (ordre, visibilité, titres) ─────────────
CREATE TABLE IF NOT EXISTS sections (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    key         TEXT    NOT NULL UNIQUE, -- hero | expertise | experience | projects | contact
    nav_label   TEXT    NOT NULL DEFAULT '{}', -- i18n
    eyebrow     TEXT    NOT NULL DEFAULT '{}', -- i18n (petit label orange)
    heading     TEXT    NOT NULL DEFAULT '{}', -- i18n
    subheading  TEXT    NOT NULL DEFAULT '{}', -- i18n
    cta_label   TEXT    NOT NULL DEFAULT '{}', -- i18n
    position    INTEGER NOT NULL DEFAULT 0,
    visible     INTEGER NOT NULL DEFAULT 1,
    in_nav      INTEGER NOT NULL DEFAULT 1
);

-- ── Cartes d'expertise ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expertise_cards (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    icon        TEXT    NOT NULL DEFAULT 'code',
    title       TEXT    NOT NULL DEFAULT '{}', -- i18n
    description TEXT    NOT NULL DEFAULT '{}', -- i18n
    skills      TEXT    NOT NULL DEFAULT '{}', -- i18n -> string[]
    position    INTEGER NOT NULL DEFAULT 0,
    visible     INTEGER NOT NULL DEFAULT 1
);

-- ── Timeline : groupes (Expériences, Formation, …) ────────────────────────
CREATE TABLE IF NOT EXISTS timeline_groups (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    eyebrow  TEXT    NOT NULL DEFAULT '{}', -- i18n
    heading  TEXT    NOT NULL DEFAULT '{}', -- i18n
    side     TEXT    NOT NULL DEFAULT 'left' CHECK (side IN ('left','right')),
    position INTEGER NOT NULL DEFAULT 0,
    visible  INTEGER NOT NULL DEFAULT 1
);

-- ── Timeline : entrées ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timeline_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id    INTEGER NOT NULL REFERENCES timeline_groups(id) ON DELETE CASCADE,
    company     TEXT    NOT NULL,
    role        TEXT    NOT NULL DEFAULT '{}', -- i18n
    period      TEXT    NOT NULL DEFAULT '{}', -- i18n
    location    TEXT    NOT NULL DEFAULT '',
    description TEXT    NOT NULL DEFAULT '{}', -- i18n
    tags        TEXT    NOT NULL DEFAULT '{}', -- i18n -> string[]
    icon        TEXT    NOT NULL DEFAULT 'work',
    is_current  INTEGER NOT NULL DEFAULT 0,
    badge       TEXT    NOT NULL DEFAULT '{}', -- i18n
    logo_id     INTEGER REFERENCES media(id) ON DELETE SET NULL,
    position    INTEGER NOT NULL DEFAULT 0,
    visible     INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_timeline_items_group
    ON timeline_items(group_id, position);

-- ── Projets ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    slug             TEXT    NOT NULL UNIQUE,
    title            TEXT    NOT NULL,
    description      TEXT    NOT NULL DEFAULT '{}', -- i18n
    full_description TEXT    NOT NULL DEFAULT '{}', -- i18n
    architecture     TEXT    NOT NULL DEFAULT '{}', -- i18n
    tags             TEXT    NOT NULL DEFAULT '{}', -- i18n -> string[]
    image_id         INTEGER REFERENCES media(id) ON DELETE SET NULL,
    image_alt        TEXT    NOT NULL DEFAULT '{}', -- i18n
    badge            TEXT    NOT NULL DEFAULT '{}', -- i18n
    status_text      TEXT    NOT NULL DEFAULT '{}', -- i18n
    action_type      TEXT    NOT NULL DEFAULT 'info'
                     CHECK (action_type IN ('source','info','visit')),
    action_url       TEXT,
    featured         INTEGER NOT NULL DEFAULT 1, -- affiché sur l'accueil
    position         INTEGER NOT NULL DEFAULT 0,
    visible          INTEGER NOT NULL DEFAULT 1,
    created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_projects_visible ON projects(visible, position);

-- ── Compte admin ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    created_at    INTEGER NOT NULL,
    last_login_at INTEGER
);

-- ── Sessions (le cookie contient le token brut, la table son SHA-256) ─────
CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    user_agent TEXT,
    ip         TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ── Limitation des tentatives de connexion ────────────────────────────────
CREATE TABLE IF NOT EXISTS login_attempts (
    ip            TEXT    PRIMARY KEY,
    count         INTEGER NOT NULL DEFAULT 0,
    first_at      INTEGER NOT NULL,
    locked_until  INTEGER
);
