import { DatabaseSync } from "node:sqlite";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import schema from "./schema.sql?raw";

/**
 * Connexion SQLite unique au processus.
 *
 * On passe par `globalThis` : en dev, le HMR de Vite ré-exécute ce module à
 * chaque modification, ce qui ouvrirait une connexion supplémentaire (et
 * laisserait fuiter des handles de fichier) à chaque rechargement.
 */
const GLOBAL_KEY = Symbol.for("portfolio.db");

type GlobalWithDb = typeof globalThis & { [GLOBAL_KEY]?: DatabaseSync };

export const DATABASE_PATH = resolve(
    process.env.DATABASE_PATH || "./data/portfolio.db",
);

function open(): DatabaseSync {
    mkdirSync(dirname(DATABASE_PATH), { recursive: true });

    const db = new DatabaseSync(DATABASE_PATH);

    // WAL : lectures concurrentes non bloquées par les écritures de l'admin.
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("PRAGMA busy_timeout = 5000");
    db.exec("PRAGMA synchronous = NORMAL");

    // Le schéma est intégralement idempotent (CREATE TABLE IF NOT EXISTS),
    // il peut donc être rejoué à chaque démarrage.
    db.exec(schema);

    // `CREATE TABLE IF NOT EXISTS` ne touche pas aux tables déjà créées :
    // les colonnes ajoutées après une mise en production doivent l'être ici.
    migrate(db);

    return db;
}

/** Ajoute une colonne si elle manque. Sans effet si elle existe déjà. */
function ensureColumn(
    db: DatabaseSync,
    table: string,
    column: string,
    definition: string,
): void {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as {
        name: string;
    }[];

    if (columns.some((c) => c.name === column)) return;

    // SQLite impose une valeur par défaut constante sur ALTER TABLE ADD COLUMN,
    // ce que respectent toutes les définitions ci-dessous.
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

/**
 * Migrations additives, rejouées à chaque démarrage.
 *
 * On ne versionne pas : chaque étape vérifie elle-même si elle est nécessaire,
 * ce qui rend l'ordre et le nombre d'exécutions sans importance.
 */
function migrate(db: DatabaseSync): void {
    // Visuel affiché à droite du hero : relief, aucun, ou terminal.
    ensureColumn(
        db,
        "site_settings",
        "hero_visual",
        "TEXT NOT NULL DEFAULT 'terrain'",
    );

    // L'ancien graphe de nœuds a été remplacé par le relief filaire.
    try {
        db.exec(
            `UPDATE site_settings SET hero_visual = 'terrain' WHERE hero_visual = 'graph'`,
        );
    } catch {
        // Une base créée avec l'ancienne contrainte CHECK refuse la nouvelle
        // valeur. Sans importance : la lecture traite 'graph' comme un alias
        // de 'terrain' (voir `getSettings`).
    }
}

export function getDb(): DatabaseSync {
    const g = globalThis as GlobalWithDb;
    if (!g[GLOBAL_KEY]) {
        g[GLOBAL_KEY] = open();
    }
    return g[GLOBAL_KEY];
}

/** Exécute `fn` dans une transaction, avec rollback en cas d'exception. */
export function transaction<T>(fn: (db: DatabaseSync) => T): T {
    const db = getDb();
    db.exec("BEGIN");
    try {
        const result = fn(db);
        db.exec("COMMIT");
        return result;
    } catch (error) {
        db.exec("ROLLBACK");
        throw error;
    }
}

// ── Helpers de requête ────────────────────────────────────────────────────
// node:sqlite renvoie des objets à prototype nul et n'accepte que
// string | number | bigint | null | Uint8Array comme paramètres.

export type SqlValue = string | number | bigint | null | Uint8Array;

/** Normalise les valeurs JS (booléens, undefined) en valeurs SQLite. */
export function bind(...params: unknown[]): SqlValue[] {
    return params.map((p) => {
        if (p === undefined || p === null) return null;
        if (typeof p === "boolean") return p ? 1 : 0;
        if (typeof p === "string" || typeof p === "number" || typeof p === "bigint") return p;
        if (p instanceof Uint8Array) return p;
        return String(p);
    });
}

export function all<T = Record<string, unknown>>(
    sql: string,
    ...params: unknown[]
): T[] {
    const rows = getDb().prepare(sql).all(...bind(...params));
    // Retire le prototype nul pour que le spread et l'accès aux clés
    // se comportent normalement côté composants.
    return rows.map((r) => ({ ...r })) as T[];
}

export function get<T = Record<string, unknown>>(
    sql: string,
    ...params: unknown[]
): T | undefined {
    const row = getDb().prepare(sql).get(...bind(...params));
    return row === undefined ? undefined : ({ ...row } as T);
}

export function run(sql: string, ...params: unknown[]) {
    return getDb().prepare(sql).run(...bind(...params));
}
