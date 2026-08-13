import {
    createHash,
    randomBytes,
    scrypt as scryptCallback,
    timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type { AstroCookies } from "astro";
import { get, run } from "./db";

const scrypt = promisify(scryptCallback) as (
    password: string | Buffer,
    salt: string | Buffer,
    keylen: number,
    options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// ── Hachage des mots de passe (scrypt, via node:crypto) ───────────────────
// Pas de dépendance native à compiler : le module crypto de Node suffit et
// scrypt est un KDF à coût mémoire, adapté au stockage de mots de passe.

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LENGTH = 64;

export const MIN_PASSWORD_LENGTH = 12;

export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = await scrypt(password, salt, KEY_LENGTH, SCRYPT);
    return [
        "scrypt",
        SCRYPT.N,
        SCRYPT.r,
        SCRYPT.p,
        salt.toString("base64"),
        derived.toString("base64"),
    ].join("$");
}

export async function verifyPassword(
    password: string,
    stored: string,
): Promise<boolean> {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;

    const [, n, r, p, saltB64, hashB64] = parts;
    const salt = Buffer.from(saltB64!, "base64");
    const expected = Buffer.from(hashB64!, "base64");

    let derived: Buffer;
    try {
        derived = await scrypt(password, salt, expected.length, {
            N: Number(n),
            r: Number(r),
            p: Number(p),
            maxmem: SCRYPT.maxmem,
        });
    } catch {
        return false;
    }

    return derived.length === expected.length && timingSafeEqual(derived, expected);
}

// ── Comptes ───────────────────────────────────────────────────────────────

export interface AdminUser {
    id: number;
    username: string;
    password_hash: string;
    created_at: number;
    last_login_at: number | null;
}

export function hasAdminUser(): boolean {
    return Boolean(get(`SELECT id FROM admin_users LIMIT 1`));
}

export function findUserByName(username: string): AdminUser | undefined {
    return get<AdminUser>(
        `SELECT * FROM admin_users WHERE username = ? COLLATE NOCASE`,
        username,
    );
}

export function findUserById(id: number): AdminUser | undefined {
    return get<AdminUser>(`SELECT * FROM admin_users WHERE id = ?`, id);
}

export async function createAdminUser(
    username: string,
    password: string,
): Promise<number> {
    const hash = await hashPassword(password);
    const result = run(
        `INSERT INTO admin_users (username, password_hash, created_at)
         VALUES (?, ?, ?)`,
        username,
        hash,
        Date.now(),
    );
    return Number(result.lastInsertRowid);
}

export async function changePassword(
    userId: number,
    password: string,
): Promise<void> {
    const hash = await hashPassword(password);
    run(`UPDATE admin_users SET password_hash = ? WHERE id = ?`, hash, userId);
    // Toutes les autres sessions deviennent invalides après un changement
    // de mot de passe.
    run(`DELETE FROM sessions WHERE user_id = ?`, userId);
}

// ── Sessions ──────────────────────────────────────────────────────────────

export const SESSION_COOKIE = "portfolio_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

/** Le cookie contient le token brut ; la base n'en stocke que le SHA-256. */
function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

export interface Session {
    id: string;
    user_id: number;
    created_at: number;
    expires_at: number;
}

export function createSession(
    userId: number,
    meta: { userAgent?: string | null; ip?: string | null } = {},
): string {
    const token = randomBytes(32).toString("base64url");
    const now = Date.now();

    run(
        `INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent, ip)
         VALUES (?, ?, ?, ?, ?, ?)`,
        hashToken(token),
        userId,
        now,
        now + SESSION_TTL_MS,
        meta.userAgent?.slice(0, 300) ?? null,
        meta.ip ?? null,
    );

    // Purge opportuniste : évite une tâche planifiée pour si peu.
    run(`DELETE FROM sessions WHERE expires_at < ?`, now);

    return token;
}

export function resolveSession(token: string | undefined): AdminUser | null {
    if (!token) return null;

    const session = get<Session>(
        `SELECT * FROM sessions WHERE id = ?`,
        hashToken(token),
    );
    if (!session) return null;

    if (session.expires_at < Date.now()) {
        run(`DELETE FROM sessions WHERE id = ?`, session.id);
        return null;
    }

    return findUserById(session.user_id) ?? null;
}

export function destroySession(token: string | undefined): void {
    if (!token) return;
    run(`DELETE FROM sessions WHERE id = ?`, hashToken(token));
}

export function setSessionCookie(
    cookies: AstroCookies,
    token: string,
    secure: boolean,
): void {
    cookies.set(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: SESSION_TTL_MS / 1000,
    });
}

export function clearSessionCookie(cookies: AstroCookies): void {
    cookies.delete(SESSION_COOKIE, { path: "/" });
}

// ── Limitation des tentatives de connexion ────────────────────────────────

const MAX_ATTEMPTS = 8;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;

export interface RateLimitState {
    locked: boolean;
    retryAfterSeconds: number;
    remaining: number;
}

export function checkLoginRateLimit(ip: string): RateLimitState {
    const now = Date.now();
    const row = get<{ count: number; first_at: number; locked_until: number | null }>(
        `SELECT count, first_at, locked_until FROM login_attempts WHERE ip = ?`,
        ip,
    );

    if (!row) return { locked: false, retryAfterSeconds: 0, remaining: MAX_ATTEMPTS };

    if (row.locked_until && row.locked_until > now) {
        return {
            locked: true,
            retryAfterSeconds: Math.ceil((row.locked_until - now) / 1000),
            remaining: 0,
        };
    }

    // Fenêtre écoulée : le compteur repart de zéro.
    if (now - row.first_at > ATTEMPT_WINDOW_MS) {
        run(`DELETE FROM login_attempts WHERE ip = ?`, ip);
        return { locked: false, retryAfterSeconds: 0, remaining: MAX_ATTEMPTS };
    }

    return {
        locked: false,
        retryAfterSeconds: 0,
        remaining: Math.max(0, MAX_ATTEMPTS - row.count),
    };
}

export function recordFailedLogin(ip: string): RateLimitState {
    const now = Date.now();
    const row = get<{ count: number; first_at: number }>(
        `SELECT count, first_at FROM login_attempts WHERE ip = ?`,
        ip,
    );

    if (!row || now - row.first_at > ATTEMPT_WINDOW_MS) {
        run(
            `INSERT INTO login_attempts (ip, count, first_at, locked_until)
             VALUES (?, 1, ?, NULL)
             ON CONFLICT(ip) DO UPDATE SET count = 1, first_at = ?, locked_until = NULL`,
            ip,
            now,
            now,
        );
        return { locked: false, retryAfterSeconds: 0, remaining: MAX_ATTEMPTS - 1 };
    }

    const count = row.count + 1;
    const lockedUntil = count >= MAX_ATTEMPTS ? now + LOCKOUT_MS : null;

    run(
        `UPDATE login_attempts SET count = ?, locked_until = ? WHERE ip = ?`,
        count,
        lockedUntil,
        ip,
    );

    return {
        locked: Boolean(lockedUntil),
        retryAfterSeconds: lockedUntil ? Math.ceil(LOCKOUT_MS / 1000) : 0,
        remaining: Math.max(0, MAX_ATTEMPTS - count),
    };
}

export function clearLoginAttempts(ip: string): void {
    run(`DELETE FROM login_attempts WHERE ip = ?`, ip);
}
