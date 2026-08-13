# Portfolio — Aymeric Chaverot

Portfolio bilingue (FR/EN) dont **tout le contenu est modifiable depuis une
interface d'administration**, sans toucher au code ni redéployer.

- **Astro 5** en rendu serveur (adaptateur Node, mode standalone)
- **SQLite** via `node:sqlite`, le module intégré à Node 24 — aucune
  dépendance native à compiler
- **Tailwind CSS 4**
- Déploiement **Docker** derrière nginx

---

## Sommaire

- [Démarrage rapide](#démarrage-rapide)
- [Interface d'administration](#interface-dadministration)
- [Déploiement](#déploiement)
- [Sauvegarde et restauration](#sauvegarde-et-restauration)
- [Architecture](#architecture)
- [Variables d'environnement](#variables-denvironnement)

---

## Démarrage rapide

```sh
npm install
npm run dev
```

Le site est sur http://localhost:4321.

Au premier lancement, la base est créée dans `./data/` et **amorcée avec le
contenu d'origine** (projets, parcours, expertise, réglages, images du dossier
`public/`). Rien à importer à la main.

Rends-toi ensuite sur http://localhost:4321/admin : le premier accès propose de
créer le compte administrateur.

| Commande           | Effet                                                   |
| ------------------ | -------------------------------------------------------- |
| `npm run dev`      | Serveur de développement                                 |
| `npm run build`    | Build de production dans `./dist`                        |
| `npm start`        | Lance le serveur de production (après un build)          |
| `npm run check`    | Vérification des types                                   |
| `npm run test:e2e` | Suite de bout en bout (92 assertions) contre un serveur lancé |

### Tests

`npm run test:e2e` vérifie les routes publiques, le rendu depuis la base,
l'authentification, les protections (CSRF, traversée de chemin, uploads
malveillants), les écritures avec invalidation du cache, et le chemin
formulaire sans JavaScript. Il s'exécute contre un serveur déjà démarré :

```sh
npm run build && npm start &
npm run test:e2e                        # cible http://localhost:4321
npm run test:e2e -- http://autre:4400   # ou une autre URL
```

Le script écrit dans la base : à lancer sur une instance de développement,
jamais en production.

---

## Interface d'administration

Accessible sur `/admin`. Tout ce qui est visible sur le site s'y modifie, en
français et en anglais côte à côte.

| Écran               | Ce qu'on y fait                                                                  |
| ------------------- | -------------------------------------------------------------------------------- |
| **Tableau de bord** | Vue d'ensemble, et alertes sur ce qui laisse des parties du site vides            |
| **Réglages**        | Identité, statut, terminal du hero, contact, pied de page, SEO, couleur, CV       |
| **Sections**        | Ordre, visibilité et titres des blocs de la page d'accueil                        |
| **Expertise**       | Cartes de compétences                                                             |
| **Parcours**        | Groupes de timeline (Expériences, Formation…) et leurs entrées                    |
| **Projets**         | Fiches complètes, mise en avant, publication                                      |
| **Liens & contact** | Réseaux sociaux et adresses, avec logos de marque                                 |
| **Médias**          | Envoi et gestion des images et PDF                                                |
| **Compte**          | Mot de passe et sessions actives                                                  |

Chaque élément de liste peut être **ajouté, modifié, réordonné, masqué ou
supprimé**. Masquer plutôt que supprimer conserve le contenu tout en le
retirant du site — y compris des sections entières.

Les modifications sont **visibles immédiatement** : le cache mémoire est
invalidé à chaque enregistrement.

### Terminal du hero

Le bloc de code du hero se saisit en **texte brut** dans les réglages. La
coloration syntaxique (style Rust) et la numérotation des lignes sont
appliquées au rendu — aucun HTML n'est stocké en base, donc aucune injection
possible.

### Page CV

`/{lang}/resume` est générée depuis le parcours, l'expertise et les projets,
avec une feuille de style d'impression (noir sur blanc, sans coupure d'entrée
entre deux pages). Un PDF peut être joint en téléchargement. La page se
désactive depuis les réglages.

---

## Déploiement

### Docker (recommandé)

```sh
cp .env.example .env
# Renseigne PUBLIC_SITE_URL avec ton domaine réel
docker compose up -d --build
```

Le site répond sur le port défini par `HTTP_PORT` (8080 par défaut).

`PUBLIC_SITE_URL` doit correspondre **exactement** au domaine servi : il est
figé au build dans les balises canoniques, les liens `hreflang` et les aperçus
Open Graph.

### HTTPS

`nginx.conf` fait office de reverse proxy en HTTP. Pour du HTTPS, place un
terminateur TLS devant (Caddy, Traefik, ou un certbot sur ce même nginx) et
assure-toi qu'il transmet bien :

```
X-Forwarded-Proto  https
X-Forwarded-Host   ton-domaine.fr
X-Forwarded-For    <ip client>
```

Ces en-têtes conditionnent trois choses : le drapeau `Secure` du cookie de
session, la vérification anti-CSRF, et la limitation des tentatives de
connexion par IP. Le conteneur tourne avec `TRUST_PROXY=1`, à ne garder que
derrière un proxy de confiance.

### Sans Docker

```sh
npm ci
npm run build
DATABASE_PATH=/var/lib/portfolio/portfolio.db \
UPLOADS_DIR=/var/lib/portfolio/uploads \
PUBLIC_SITE_URL=https://ton-domaine.fr \
PORT=4321 npm start
```

---

## Sauvegarde et restauration

**Tout l'état du site tient dans le volume `/data`** : la base SQLite et les
fichiers envoyés. C'est la seule chose à sauvegarder.

```sh
# Sauvegarde (à chaud, sans arrêter le site)
docker compose exec portfolio \
    node -e "const{DatabaseSync}=require('node:sqlite'); \
             new DatabaseSync('/data/portfolio.db').exec(\"VACUUM INTO '/data/backup.db'\")"
docker compose cp portfolio:/data/backup.db ./backup-$(date +%F).db

# Archive complète (base + médias)
docker run --rm -v portfolio_portfolio-data:/data -v "$PWD":/out alpine \
    tar czf /out/portfolio-$(date +%F).tar.gz -C /data .
```

`VACUUM INTO` produit une copie cohérente même pendant que le site écrit ;
copier `portfolio.db` directement pendant une écriture donnerait un fichier
potentiellement corrompu (la base est en mode WAL).

Restauration :

```sh
docker compose down
docker run --rm -v portfolio_portfolio-data:/data -v "$PWD":/in alpine \
    sh -c "rm -rf /data/* && tar xzf /in/portfolio-AAAA-MM-JJ.tar.gz -C /data"
docker compose up -d
```

---

## Architecture

```
src/
├── lib/
│   ├── db/
│   │   ├── schema.sql      Schéma SQLite (idempotent, rejoué au démarrage)
│   │   ├── index.ts        Connexion, pragmas, helpers de requête
│   │   └── seed.ts         Amorçage initial depuis le contenu d'origine
│   ├── content.ts          Lecture typée + cache mémoire invalidé à l'écriture
│   ├── i18n.ts             Résolution des champs traduisibles
│   ├── auth.ts             Mots de passe (scrypt), sessions, anti-force brute
│   ├── media.ts            Validation, redimensionnement et stockage des fichiers
│   └── highlight.ts        Coloration syntaxique du terminal du hero
├── actions/                Écritures (Astro Actions + validation zod)
├── middleware.ts           Amorçage, langue, CSRF, garde de l'admin
├── components/             Composants publics
│   └── admin/              Champs de formulaire réutilisables
├── layouts/
└── pages/
    ├── [lang]/             Site public
    ├── admin/              Administration
    ├── media/[filename].ts Service des fichiers du volume
    └── healthz.ts          Sonde de santé
```

### Internationalisation

Les colonnes traduisibles stockent `{"fr": "…", "en": "…"}`. La lecture résout
la langue demandée avec repli sur l'autre si la traduction est vide, de sorte
qu'une traduction manquante n'affiche jamais un blanc.

Les noms propres (nom, entreprise, ville, URL) restent des champs simples.

### Cache

`src/lib/content.ts` mémorise les résultats par langue derrière un compteur de
version. Toute écriture appelle `invalidateContent()`, qui incrémente le
compteur et vide le cache : le site reflète la modification à la requête
suivante.

### Sécurité

- Mots de passe hachés avec **scrypt** (`node:crypto`), 12 caractères minimum
- Sessions en base ; le cookie porte le jeton, la table n'en garde que le
  SHA-256. `httpOnly`, `SameSite=Lax`, `Secure` en HTTPS
- Connexion limitée à 8 tentatives par IP par quart d'heure, puis blocage
  temporaire ; le mot de passe est comparé à un hash factice quand
  l'identifiant n'existe pas, pour ne pas révéler les comptes valides
- **CSRF** : `src/middleware.ts` refuse toute écriture dont l'`Origin` (ou à
  défaut le `Referer`) ne correspond pas à l'hôte servi.

  > `security.checkOrigin` d'Astro est désactivé volontairement : il compare
  > l'`Origin` à `Astro.url.origin`, or l'adaptateur Node standalone renvoie
  > toujours `http://localhost`. En production, il rejette donc **toutes** les
  > requêtes de formulaire, et en développement il ne s'applique pas du tout.
  > Le contrôle maison reconstruit l'origine attendue depuis `Host`,
  > `X-Forwarded-Host` et `PUBLIC_SITE_URL`.

- Uploads : type vérifié en lisant réellement le fichier (un exécutable
  renommé `.png` est refusé), SVG contenant du script refusé, 8 Mo maximum,
  noms de fichiers réécrits en UUID
- Le service des médias interdit la traversée de chemin et envoie `nosniff`
- L'administration n'est ni indexée ni mise en cache

---

## Variables d'environnement

| Variable           | Défaut                  | Rôle                                                        |
| ------------------ | ----------------------- | ----------------------------------------------------------- |
| `PUBLIC_SITE_URL`  | `http://localhost:4321` | URL publique (canoniques, hreflang, Open Graph). **Au build.** |
| `DATABASE_PATH`    | `./data/portfolio.db`   | Fichier SQLite                                               |
| `UPLOADS_DIR`      | `./data/uploads`        | Dossier des fichiers envoyés                                 |
| `SEED_ASSETS_DIR`  | —                       | Où chercher les images d'origine lors de l'amorçage          |
| `TRUST_PROXY`      | `0`                     | `1` derrière un reverse proxy : lit les en-têtes `X-Forwarded-*` |
| `HOST` / `PORT`    | `0.0.0.0` / `4321`      | Écoute du serveur                                            |
| `HTTP_PORT`        | `8080`                  | Port exposé par nginx (compose uniquement)                   |
