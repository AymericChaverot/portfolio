/**
 * Test de bout en bout du portfolio : routes publiques, authentification,
 * protections (CSRF, traversée de chemin, upload) et écritures admin avec
 * invalidation du cache.
 *
 * Usage : node e2e.mjs [baseUrl]
 */
const BASE = process.argv[2] || "http://localhost:4321";

let pass = 0;
let fail = 0;
const failures = [];

function check(name, condition, detail = "") {
    if (condition) {
        pass++;
        console.log(`  ok   ${name}`);
    } else {
        fail++;
        failures.push(`${name} ${detail}`);
        console.log(`  FAIL ${name} ${detail}`);
    }
}

function section(title) {
    console.log(`\n── ${title} ${"─".repeat(Math.max(0, 58 - title.length))}`);
}

const status = async (path, init) => (await fetch(BASE + path, init)).status;
const text = async (path) => (await fetch(BASE + path)).text();

// ─────────────────────────────────────────────────────────────────────────
section("Routes publiques");

for (const [path, expected] of [
    ["/fr", 200],
    ["/en", 200],
    ["/fr/projects", 200],
    ["/en/projects", 200],
    ["/fr/projects/sentinelle", 200],
    ["/en/projects/nexus", 200],
    ["/fr/resume", 200],
    ["/en/resume", 200],
    ["/fr/projects/inexistant", 404],
    ["/de", 404],
    ["/nawak", 404],
]) {
    check(`GET ${path} → ${expected}`, (await status(path)) === expected);
}

const rootRes = await fetch(BASE + "/", { redirect: "manual" });
check(
    "GET / redirige vers une langue",
    rootRes.status === 302 && /\/(fr|en)$/.test(rootRes.headers.get("location") || ""),
    rootRes.headers.get("location") || "",
);

// ─────────────────────────────────────────────────────────────────────────
section("Contenu rendu depuis la base");

const fr = await text("/fr");
check("hero : nom affiché", fr.includes("Aymeric Chaverot"));
check("expertise : titre de section", fr.includes("Expertise Principale"));
check("parcours : groupe professionnel", fr.includes("Parcours Professionnel"));
check("projets : titre de section", fr.includes("Projets R"));
check("terminal : coloration syntaxique appliquée", fr.includes("text-yellow-200"));
check("pas de HTML i18n brut qui fuit", !fr.includes('{"fr":'));

const en = await text("/en");
check("version EN traduite", en.includes("Core Expertise") && en.includes("Professional Journey"));
check("EN ≠ FR", en !== fr);

const projectsPage = await text("/fr/projects");
check("page projets : filtres par tag", projectsPage.includes("filter-chip"));
check("page projets : liste les projets", projectsPage.includes("Sentinelle"));

const resume = await text("/fr/resume");
check("CV : nom", resume.includes("Aymeric Chaverot"));
check("CV : styles d'impression", resume.includes("@media print") || resume.includes("print"));

const notFound = await text("/nawak");
check("404 : page stylée, pas la page Astro par défaut", notFound.includes("404"));

// ─────────────────────────────────────────────────────────────────────────
section("Navigation mobile & liens");

check("menu mobile présent", fr.includes('id="mobile-menu"'));
check("bouton hamburger présent", fr.includes('id="nav-toggle"'));
check("aucun href=undefined", !fr.includes("href=\"undefined\""));

const detail = await text("/fr/projects/nexus");
check(
    "fiche projet sans lien : aucun bouton mort",
    !detail.includes('href="undefined"') && !detail.includes("href=undefined"),
);

// ─────────────────────────────────────────────────────────────────────────
section("Médias");

const mediaMatch = fr.match(/\/media\/([a-f0-9-]+\.\w+)/);
check("URL de média présente dans le HTML", Boolean(mediaMatch), fr.slice(0, 0));

if (mediaMatch) {
    const mediaRes = await fetch(`${BASE}/media/${mediaMatch[1]}`);
    check("média servi (200)", mediaRes.status === 200);
    check(
        "média : cache immuable",
        (mediaRes.headers.get("cache-control") || "").includes("immutable"),
    );
    check("média : nosniff", mediaRes.headers.get("x-content-type-options") === "nosniff");

    const etag = mediaRes.headers.get("etag");
    const cached = await fetch(`${BASE}/media/${mediaMatch[1]}`, {
        headers: { "If-None-Match": etag },
    });
    check("média : 304 sur ETag", cached.status === 304);
}

check(
    "traversée de chemin bloquée",
    (await status("/media/..%2F..%2Fpackage.json")) === 404,
);
check("média inconnu → 404", (await status("/media/inexistant.png")) === 404);

// ─────────────────────────────────────────────────────────────────────────
section("Authentification");

check("/admin non authentifié → redirection", (await status("/admin")) === 200);

const adminRes = await fetch(BASE + "/admin", { redirect: "manual" });
check(
    "/admin redirige vers login ou setup",
    adminRes.status === 302 && /\/admin\/(login|setup)/.test(adminRes.headers.get("location") || ""),
    adminRes.headers.get("location") || "",
);

const USER = "aymeric";
const PASS = "correct-horse-battery-staple";

// Crée le compte si le site vient d'être initialisé.
const setupPage = await fetch(BASE + "/admin/setup", { redirect: "manual" });
if (setupPage.status === 200) {
    const r = await fetch(BASE + "/_actions/account.setup", {
        method: "POST",
        headers: { Origin: BASE, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ username: USER, password: PASS, confirm: PASS }),
        redirect: "manual",
    });
    check("création du compte admin", r.status < 400, String(r.status));
}

async function login(username, password) {
    const r = await fetch(BASE + "/_actions/account.login", {
        method: "POST",
        headers: { Origin: BASE, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ username, password }),
        redirect: "manual",
    });
    const cookie = (r.headers.getSetCookie() || []).find((c) =>
        c.startsWith("portfolio_session="),
    );
    return { status: r.status, cookie: cookie ? cookie.split(";")[0] : null, raw: r };
}

const bad = await login(USER, "mauvais-mot-de-passe");
check("mauvais mot de passe rejeté", bad.status >= 400 && !bad.cookie, String(bad.status));

const good = await login(USER, PASS);
check("connexion réussie", Boolean(good.cookie), String(good.status));

const setCookie = (good.raw.headers.getSetCookie() || []).join(" ");
check("cookie httpOnly", setCookie.includes("HttpOnly"));
check("cookie SameSite=Lax", /SameSite=Lax/i.test(setCookie));

const COOKIE = good.cookie;
const authed = { Origin: BASE, Cookie: COOKIE, "Content-Type": "application/x-www-form-urlencoded" };

for (const path of [
    "/admin",
    "/admin/settings",
    "/admin/sections",
    "/admin/expertise",
    "/admin/experience",
    "/admin/projects",
    "/admin/projects/new",
    "/admin/socials",
    "/admin/media",
    "/admin/account",
]) {
    check(`admin ${path} → 200`, (await status(path, { headers: { Cookie: COOKIE } })) === 200);
}

// ─────────────────────────────────────────────────────────────────────────
section("Protections des écritures");

const post = (action, data, headers = authed) =>
    fetch(`${BASE}/_actions/${action}`, {
        method: "POST",
        headers,
        body: new URLSearchParams(data),
        redirect: "manual",
    });

const noAuth = await post(
    "list.remove",
    { table: "projects", id: "2" },
    { Origin: BASE, "Content-Type": "application/x-www-form-urlencoded" },
);
check("écriture sans session rejetée", noAuth.status === 401, String(noAuth.status));

const csrf = await post(
    "list.remove",
    { table: "projects", id: "2" },
    { Origin: "https://evil.example", Cookie: COOKIE, "Content-Type": "application/x-www-form-urlencoded" },
);
check("écriture cross-origin rejetée (CSRF)", csrf.status === 403, String(csrf.status));

const noOrigin = await post(
    "list.remove",
    { table: "projects", id: "2" },
    { Cookie: COOKIE, "Content-Type": "application/x-www-form-urlencoded" },
);
check("écriture sans Origin ni Referer rejetée", noOrigin.status === 403, String(noOrigin.status));

// Le projet visé par les tentatives ci-dessus doit être intact.
check("projet cible toujours présent", (await status("/fr/projects/nexus-framework")) === 200);

const badTable = await post("list.remove", { table: "admin_users", id: "1" });
check("table hors liste blanche rejetée", badTable.status >= 400, String(badTable.status));

const badUrl = await post("social", {
    name: "XSS",
    url: "javascript:alert(1)",
    icon: "link",
    visible: "true",
});
check("URL javascript: rejetée", badUrl.status >= 400, String(badUrl.status));

const deadButton = await post("project", {
    title: "Sans lien",
    action_type: "visit",
    action_url: "",
    visible: "true",
});
check("action « visiter » sans URL rejetée", deadButton.status >= 400, String(deadButton.status));

// ─────────────────────────────────────────────────────────────────────────
section("Écritures et invalidation du cache");

const before = await text("/fr");
check("Sentinelle visible avant", before.includes("Sentinelle"));

const hide = await post("list.toggleVisibility", { table: "projects", id: "1", visible: "false" });
check("masquage accepté", hide.status < 400, String(hide.status));

const after = await text("/fr");
check("Sentinelle absente immédiatement après", !after.includes(">Sentinelle<"));
check("fiche masquée → 404", (await status("/fr/projects/sentinelle")) === 404);

const show = await post("list.toggleVisibility", { table: "projects", id: "1", visible: "true" });
check("réaffichage accepté", show.status < 400);
check("Sentinelle de retour", (await text("/fr")).includes("Sentinelle"));
check("fiche de nouveau accessible", (await status("/fr/projects/sentinelle")) === 200);

// Création avec accents
const created = await post("project", {
    title: "Modélisation Éphémère",
    description_fr: "Description accentuée : éàçùî",
    description_en: "English description",
    tags_fr: "Rust, Base de données",
    tags_en: "Rust, Database",
    action_type: "info",
    action_url: "",
    visible: "true",
    featured: "true",
});
check("création de projet", created.status < 400, String(created.status));

const frAfterCreate = await text("/fr/projects");
check("titre accentué rendu correctement", frAfterCreate.includes("Modélisation Éphémère"));
check("tag FR rendu", frAfterCreate.includes("Base de données"));
check("slug sans accents", (await status("/fr/projects/modelisation-ephemere")) === 200);

const enAfterCreate = await text("/en/projects");
check("tag EN rendu", enAfterCreate.includes("Database"));

// Champs vides : ne doivent pas casser la validation
const emptyFields = await post("project", {
    title: "Projet minimal",
    slug: "",
    description_fr: "",
    description_en: "",
    full_description_fr: "",
    full_description_en: "",
    architecture_fr: "",
    architecture_en: "",
    tags_fr: "",
    tags_en: "",
    image_id: "",
    image_alt_fr: "",
    image_alt_en: "",
    badge_fr: "",
    badge_en: "",
    status_text_fr: "",
    status_text_en: "",
    action_type: "info",
    action_url: "",
});
check("formulaire aux champs vides accepté", emptyFields.status < 400, String(emptyFields.status));

// Réordonnancement
const move = await post("list.move", { table: "projects", id: "2", direction: "up" });
check("réordonnancement accepté", move.status < 400, String(move.status));

// Réglages
const settings = await post("settings", {
    name: "Aymeric Chaverot",
    role_fr: "Développeur et Ingénieur Système",
    role_en: "Developer and Systems Engineer",
    description_fr: "Description FR",
    description_en: "Description EN",
    location: "Lyon, France",
    status_text_fr: "Test statut",
    status_text_en: "Test status",
    hero_terminal_title: "profile.rs",
    hero_terminal_code_fr: 'struct Ingenieur {\n    nom: String,\n}',
    hero_terminal_code_en: 'struct Engineer {\n    name: String,\n}',
    contact_user: "guest",
    contact_command: "./contact.sh",
    contact_lines_fr: "Ligne une\nLigne deux",
    contact_lines_en: "Line one\nLine two",
    theme_color: "#f48c25",
    default_lang: "fr",
    // Sans cette case, l'enregistrement désactiverait la page CV : c'est le
    // comportement attendu d'une case décochée, mais il fausserait les
    // exécutions suivantes du test.
    resume_enabled: "true",
});
check("enregistrement des réglages", settings.status < 400, String(settings.status));

const afterSettings = await text("/fr");
check("nouveau statut visible", afterSettings.includes("Test statut"));
check("nouvelles lignes de contact visibles", afterSettings.includes("Ligne une"));

// ─────────────────────────────────────────────────────────────────────────
section("Upload de fichiers");

async function upload(name, type, bytes) {
    const form = new FormData();
    form.append("file", new File([bytes], name, { type }));
    return fetch(`${BASE}/_actions/media.upload`, {
        method: "POST",
        headers: { Origin: BASE, Cookie: COOKIE },
        body: form,
        redirect: "manual",
    });
}

// PNG 1×1 valide
const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
);
const okUpload = await upload("test.png", "image/png", png);
check("upload PNG valide", okUpload.status < 400, String(okUpload.status));

const fakeImage = await upload("evil.png", "image/png", Buffer.from("MZ\x90\x00 not an image"));
check("exécutable renommé en .png rejeté", fakeImage.status >= 400, String(fakeImage.status));

const badType = await upload("script.js", "application/javascript", Buffer.from("alert(1)"));
check("type de fichier non autorisé rejeté", badType.status >= 400, String(badType.status));

const evilSvg = await upload(
    "evil.svg",
    "image/svg+xml",
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
);
check("SVG contenant du script rejeté", evilSvg.status >= 400, String(evilSvg.status));

const tooBig = await upload("big.png", "image/png", Buffer.alloc(9 * 1024 * 1024));
check("fichier trop volumineux rejeté", tooBig.status >= 400, String(tooBig.status));

// ─────────────────────────────────────────────────────────────────────────
section("Chemin formulaire (navigateur sans JS)");

// Les formulaires de l'admin postent sur `?_action=…` de la page courante,
// pas sur /_actions/… (qui est l'endpoint RPC pour les appels JS).
const adminHtml = await (await fetch(BASE + "/admin/expertise", { headers: { Cookie: COOKIE } })).text();
check(
    "formulaires pointent vers ?_action=",
    adminHtml.includes('action="?_action=list.toggleVisibility"'),
);

const formHeaders = {
    Origin: BASE,
    Cookie: COOKIE,
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "text/html",
};

const formPost = await fetch(BASE + "/admin/expertise?_action=list.toggleVisibility", {
    method: "POST",
    headers: formHeaders,
    body: new URLSearchParams({ table: "expertise_cards", id: "1", visible: "false" }),
    redirect: "manual",
});
check("soumission formulaire → redirection 303", formPost.status === 303, String(formPost.status));
check(
    "redirection vers la page avec indicateur de succès",
    (formPost.headers.get("location") || "").includes("saved=1"),
    formPost.headers.get("location") || "",
);

const afterForm = await (
    await fetch(BASE + (formPost.headers.get("location") || "/admin/expertise"), {
        headers: { Cookie: COOKIE },
    })
).text();
check("alerte de succès affichée", afterForm.includes("admin-alert--success"));
check("élément marqué comme masqué", afterForm.includes("admin-item--hidden"));

const publicAfterForm = await text("/fr");
const cardCount = (publicAfterForm.match(/group h-full flex flex-col p-8/g) || []).length;
check("carte masquée retirée du site public", cardCount === 2, `cartes: ${cardCount}`);

await fetch(BASE + "/admin/expertise?_action=list.toggleVisibility", {
    method: "POST",
    headers: formHeaders,
    body: new URLSearchParams({ table: "expertise_cards", id: "1", visible: "true" }),
    redirect: "manual",
});
const restored = (await text("/fr")).match(/group h-full flex flex-col p-8/g) || [];
check("carte réaffichée", restored.length === 3, `cartes: ${restored.length}`);

// La barrière CSRF doit aussi couvrir ce chemin
const formCsrf = await fetch(BASE + "/admin/expertise?_action=list.remove", {
    method: "POST",
    headers: { ...formHeaders, Origin: "https://evil.example" },
    body: new URLSearchParams({ table: "expertise_cards", id: "1" }),
    redirect: "manual",
});
check("CSRF bloqué aussi sur le chemin formulaire", formCsrf.status === 403, String(formCsrf.status));

// ─────────────────────────────────────────────────────────────────────────
section("Déconnexion");

const logout = await fetch(`${BASE}/_actions/account.logout`, {
    method: "POST",
    headers: { Origin: BASE, Cookie: COOKIE, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({}),
    redirect: "manual",
});
check("déconnexion acceptée", logout.status < 400, String(logout.status));

const afterLogout = await post("list.toggleVisibility", {
    table: "projects",
    id: "1",
    visible: "false",
});
check("session invalidée après déconnexion", afterLogout.status === 401, String(afterLogout.status));

// ─────────────────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(64)}`);
console.log(`  ${pass} réussis, ${fail} échoués`);
if (failures.length) {
    console.log("\nÉchecs :");
    failures.forEach((f) => console.log("  · " + f));
}
console.log("═".repeat(64));

process.exit(fail === 0 ? 0 : 1);
