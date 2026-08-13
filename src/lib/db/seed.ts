import { get, run } from "./index";
import { importSeedImage } from "../media";
import { invalidateContent } from "../content";

/**
 * Amorçage de la base à partir du contenu qui était codé en dur dans
 * `src/config.ts`, `src/data/projects.ts` et les composants.
 *
 * Ne s'exécute qu'une fois : si la ligne de réglages existe déjà, on ne
 * touche à rien pour ne jamais écraser les modifications faites en admin.
 */

/** Raccourci : construit le JSON i18n d'un champ texte. */
const i18n = (fr: string, en: string) => JSON.stringify({ fr, en });

/** Idem pour un champ liste. */
const i18nList = (fr: string[], en: string[]) => JSON.stringify({ fr, en });

const HERO_CODE_FR = `struct Ingenieur {
    nom: String,
    competences: Vec<Skill>,
    localisation: String,
}

impl Ingenieur {
    fn nouveau() -> Self {
        Ingenieur {
            nom: "Aymeric Chaverot".to_string(),
            competences: vec!["Architecture", "Performance", "Systeme"],
            localisation: "Lyon, France".to_string(),
        }
    }
}`;

const HERO_CODE_EN = `struct Engineer {
    name: String,
    skills: Vec<Skill>,
    location: String,
}

impl Engineer {
    fn new() -> Self {
        Engineer {
            name: "Aymeric Chaverot".to_string(),
            skills: vec!["Architecture", "Performance", "System"],
            location: "Lyon, France".to_string(),
        }
    }
}`;

export function isSeeded(): boolean {
    return Boolean(get(`SELECT id FROM site_settings WHERE id = 1`));
}

export async function seed(): Promise<void> {
    if (isSeeded()) return;

    // ── Images livrées avec le dépôt ──────────────────────────────────────
    const [
        ogImageId,
        sentinelleId,
        nexusFrameworkId,
        nexusId,
        thalesLogoId,
        locnacelleLogoId,
        epitechLogoId,
        ecole42LogoId,
    ] = await Promise.all([
        importSeedImage("og-image.png"),
        importSeedImage("sentinelle.png", i18n("Site web Sentinelle", "Sentinelle website")),
        importSeedImage("nexus-framework.png", i18n("Nexus Framework", "Nexus Framework")),
        importSeedImage("nexus.png", i18n("Nexus", "Nexus")),
        importSeedImage("logos/thales.png", i18n("Logo Thales", "Thales logo")),
        importSeedImage("logos/locnacelle.png", i18n("Logo Loc'Nacelle", "Loc'Nacelle logo")),
        importSeedImage("logos/epitech.png", i18n("Logo EPITECH", "EPITECH logo")),
        importSeedImage("logos/42.png", i18n("Logo École 42", "École 42 logo")),
    ]);

    // ── Réglages ──────────────────────────────────────────────────────────
    run(
        `INSERT INTO site_settings (
            id, name, role, description, location,
            status_available, status_text,
            hero_cta_primary, hero_cta_secondary,
            hero_terminal_title, hero_terminal_code,
            contact_user, contact_command, contact_lines, contact_send_email,
            footer_text, footer_subtext,
            seo_title, seo_description, og_image_id,
            theme_color, default_lang, resume_enabled
        ) VALUES (
            1, ?, ?, ?, ?,
            ?, ?,
            ?, ?,
            ?, ?,
            ?, ?, ?, ?,
            ?, ?,
            ?, ?, ?,
            ?, ?, ?
        )`,
        "Aymeric Chaverot",
        i18n("Développeur et Ingénieur Système", "Developer and Systems Engineer"),
        i18n(
            "Spécialisé dans l'infrastructure haute performance, les systèmes distribués et l'ingénierie bas niveau. Je conçois des solutions robustes où l'efficacité rencontre l'évolutivité.",
            "Specializing in high-performance infrastructure, distributed systems, and low-level engineering. I build robust solutions where efficiency meets scalability.",
        ),
        "Lyon, France",
        0,
        i18n("Actuellement en poste @ Thales", "Currently in position @ Thales"),
        i18n("Voir mes projets", "View Work"),
        i18n("Me contacter", "Contact Me"),
        "profile.rs — neovim",
        i18n(HERO_CODE_FR, HERO_CODE_EN),
        "guest@aymeric",
        "./contact_me.sh",
        i18nList(
            ["Initialisation du protocole de handshake...", "Connexion établie."],
            ["Initializing handshake protocol...", "Connection established."],
        ),
        i18n("Envoyer un email", "Send Email"),
        i18n(
            "© {year} {name}. Tous les systèmes sont opérationnels.",
            "© {year} {name}. All systems operational.",
        ),
        i18n(
            "Conçu avec Astro & TailwindCSS.",
            "Built with Astro & TailwindCSS.",
        ),
        i18n("Aymeric Chaverot", "Aymeric Chaverot"),
        i18n(
            "Développeur et Ingénieur Système | Infrastructure haute performance, systèmes distribués et ingénierie bas niveau.",
            "Developer and Systems Engineer | High-performance infrastructure, distributed systems, and low-level engineering.",
        ),
        ogImageId,
        "#f48c25",
        "fr",
        1,
    );

    // ── Réseaux sociaux ───────────────────────────────────────────────────
    const socials: [string, string, string][] = [
        ["GitHub", "https://github.com/AymericChaverot", "github"],
        ["LinkedIn", "https://www.linkedin.com/in/AymericChaverot/", "linkedin"],
        ["Email", "mailto:achaverot.dev@pm.me", "email"],
    ];
    socials.forEach(([name, url, icon], index) => {
        run(
            `INSERT INTO socials (name, url, icon, position, visible)
             VALUES (?, ?, ?, ?, 1)`,
            name,
            url,
            icon,
            index,
        );
    });

    // ── Sections ──────────────────────────────────────────────────────────
    const sections: {
        key: string;
        nav: [string, string] | null;
        eyebrow?: [string, string];
        heading?: [string, string];
        subheading?: [string, string];
        cta?: [string, string];
    }[] = [
        {
            key: "hero",
            nav: ["À propos", "About"],
        },
        {
            key: "expertise",
            nav: ["Expertise", "Expertise"],
            eyebrow: ["Arsenal Technique", "Technical Arsenal"],
            heading: ["Expertise Principale", "Core Expertise"],
        },
        {
            key: "experience",
            nav: ["Expériences", "Experience"],
        },
        {
            key: "projects",
            nav: ["Projets", "Projects"],
            heading: ["Projets Réalisés", "Selected Works"],
            subheading: [
                "Un aperçu des défis techniques résolus durant mon cursus et mes explorations personnelles.",
                "A showcase of technical challenges solved during my curriculum and personal exploration.",
            ],
            cta: ["git checkout tous-les-projets", "git checkout all-projects"],
        },
        {
            key: "contact",
            nav: ["Me Contacter", "Contact Me"],
        },
    ];

    sections.forEach((section, index) => {
        run(
            `INSERT INTO sections (key, nav_label, eyebrow, heading, subheading, cta_label, position, visible, in_nav)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
            section.key,
            section.nav ? i18n(...section.nav) : "{}",
            section.eyebrow ? i18n(...section.eyebrow) : "{}",
            section.heading ? i18n(...section.heading) : "{}",
            section.subheading ? i18n(...section.subheading) : "{}",
            section.cta ? i18n(...section.cta) : "{}",
            index,
            section.nav ? 1 : 0,
        );
    });

    // ── Cartes d'expertise ────────────────────────────────────────────────
    const expertise: {
        icon: string;
        title: [string, string];
        description: [string, string];
        skills: [string[], string[]];
    }[] = [
        {
            icon: "memory",
            title: ["Système & Bas Niveau", "System & Low-Level"],
            description: [
                "Compréhension approfondie de l'architecture des ordinateurs et de la gestion mémoire. Expérience dans la création de logiciels C/C++ robustes et d'outils Unix.",
                "Deep understanding of computer architecture and memory management. Experienced in building robust C/C++ software and Unix tools.",
            ],
            skills: [
                ["C / C++", "Rust", "Unix / Linux", "Algorithmique"],
                ["C / C++", "Rust", "Unix / Linux", "Algorithms"],
            ],
        },
        {
            icon: "dns",
            title: ["Backend & DevOps", "Backend & DevOps"],
            description: [
                "Architecture d'API évolutives et gestion d'infrastructure. Accent sur l'automatisation, la conteneurisation et le déploiement continu.",
                "Architecting scalable APIs and managing infrastructure. Focus on automation, containerization, and continuous deployment.",
            ],
            skills: [
                ["Java / Node.js / Python", "Docker / Kubernetes", "CI/CD", "SQL / NoSQL"],
                ["Java / Node.js / Python", "Docker / Kubernetes", "CI/CD", "SQL / NoSQL"],
            ],
        },
        {
            icon: "code",
            title: ["Développement Fullstack", "Fullstack Development"],
            description: [
                "Création d'interfaces utilisateur modernes et réactives intégrées à des backends puissants. Passionné par la performance et l'expérience utilisateur.",
                "Creating modern, responsive user interfaces integrated with powerful backends. Passionate about performance and user experience.",
            ],
            skills: [
                ["Angular / React / TypeScript", "Astro / Tailwind", "Next.js", "WebSockets"],
                ["Angular / React / TypeScript", "Astro / Tailwind", "Next.js", "WebSockets"],
            ],
        },
    ];

    expertise.forEach((card, index) => {
        run(
            `INSERT INTO expertise_cards (icon, title, description, skills, position, visible)
             VALUES (?, ?, ?, ?, ?, 1)`,
            card.icon,
            i18n(...card.title),
            i18n(...card.description),
            i18nList(...card.skills),
            index,
        );
    });

    // ── Timeline ──────────────────────────────────────────────────────────
    const proGroup = run(
        `INSERT INTO timeline_groups (eyebrow, heading, side, position, visible)
         VALUES (?, ?, 'left', 0, 1)`,
        i18n("Parcours Professionnel", "Professional Journey"),
        i18n("Expériences", "Experience"),
    );
    const proGroupId = Number(proGroup.lastInsertRowid);

    const eduGroup = run(
        `INSERT INTO timeline_groups (eyebrow, heading, side, position, visible)
         VALUES (?, ?, 'right', 1, 1)`,
        i18n("Parcours Académique", "Academic Journey"),
        i18n("Formation", "Education"),
    );
    const eduGroupId = Number(eduGroup.lastInsertRowid);

    const timelineItems: {
        groupId: number;
        company: string;
        role: [string, string];
        period: [string, string];
        location: string;
        description: [string, string];
        tags: [string[], string[]];
        icon: string;
        isCurrent: boolean;
        badge: [string, string];
        logoId: number | null;
        position: number;
    }[] = [
        {
            groupId: proGroupId,
            company: "Thales Services Numériques",
            role: ["Développeur Java Fullstack — Stage", "Software Engineer — Internship"],
            period: ["Mars 2026 — Présent", "March 2026 — Present"],
            location: "Lyon, France",
            description: [
                "Développement d'un middleware Java pour le domaine de la microbiologie, automatisation de l'expertise de certains automates. Utilisation de technologies modernes comme Spring Boot, Angular et H2.",
                "Development of a Java middleware for the field of microbiology, automation of the expertise of certain analyzers. Use of modern technologies such as Spring Boot, Angular and H2.",
            ],
            tags: [
                ["Java", "Spring Boot", "Angular", "H2", "Maven", "GitLab"],
                ["Java", "Spring Boot", "Angular", "H2", "Maven", "GitLab"],
            ],
            icon: "biotech",
            isCurrent: true,
            badge: ["En poste", "Current"],
            logoId: thalesLogoId,
            position: 0,
        },
        {
            groupId: proGroupId,
            company: "Loc'Nacelle",
            role: ["Développeur Java Fullstack — Stage", "Software Engineer — Internship"],
            period: ["Juin 2023 — Août 2023", "June 2023 — Aug. 2023"],
            location: "Tossiat, France",
            description: [
                "Développement d'une application web Java pour la gestion de la maintenance des nacelles. Utilisation de technologies modernes comme Spring Boot, Angular et PostgreSQL.",
                "Development of a Java web application for the management of nacelle maintenance. Use of modern technologies such as Spring Boot, Angular and PostgreSQL.",
            ],
            tags: [
                ["Java", "Spring Boot", "Angular", "PostgreSQL", "Git"],
                ["Java", "Spring Boot", "Angular", "PostgreSQL", "Git"],
            ],
            icon: "forklift",
            isCurrent: false,
            badge: ["", ""],
            logoId: locnacelleLogoId,
            position: 1,
        },
        {
            groupId: eduGroupId,
            company: "EPITECH",
            role: [
                "Diplôme d'expert en systèmes d'information",
                "Information Systems Expert Degree — Master's level",
            ],
            period: ["2021 — 2026", "2021 — 2026"],
            location: "Lyon, France",
            description: [
                "Formation d'expert en systèmes d'information par la pédagogie par projets, spécialisation applications lourdes.",
                "Project-based curriculum leading to the Information Systems Expert degree, specializing in desktop applications.",
            ],
            tags: [
                ["Systèmes", "C", "C++", "Java"],
                ["Systems", "C", "C++", "Java"],
            ],
            icon: "school",
            isCurrent: true,
            badge: ["En cours", "Ongoing"],
            logoId: epitechLogoId,
            position: 0,
        },
        {
            groupId: eduGroupId,
            company: "École 42",
            role: ["Concours d'entrée réussi", "Entrance Exam Passed"],
            period: ["2019 — 2020", "2019 — 2020"],
            location: "Paris, France",
            description: [
                "Formation par projets, sélection des étudiants sur concours. Appelé « Piscine », le concours consiste en un mois intensif, 7j/7, à programmer des projets en C.",
                'Project-based school selecting students through a competitive exam. Known as the "Piscine", it is an intensive month of programming C projects, 7 days a week.',
            ],
            tags: [
                ["Algorithmique", "C"],
                ["Algorithms", "C"],
            ],
            icon: "pool",
            isCurrent: false,
            badge: ["", ""],
            logoId: ecole42LogoId,
            position: 1,
        },
    ];

    for (const item of timelineItems) {
        run(
            `INSERT INTO timeline_items
                (group_id, company, role, period, location, description, tags,
                 icon, is_current, badge, logo_id, position, visible)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            item.groupId,
            item.company,
            i18n(...item.role),
            i18n(...item.period),
            item.location,
            i18n(...item.description),
            i18nList(...item.tags),
            item.icon,
            item.isCurrent ? 1 : 0,
            i18n(...item.badge),
            item.logoId,
            item.position,
        );
    }

    // ── Projets ───────────────────────────────────────────────────────────
    const projects: {
        slug: string;
        title: string;
        description: [string, string];
        fullDescription: [string, string];
        architecture: [string, string];
        tags: [string[], string[]];
        imageId: number | null;
        imageAlt: [string, string];
        badge: [string, string];
        statusText: [string, string];
        actionType: string;
        actionUrl: string | null;
    }[] = [
        {
            slug: "sentinelle",
            title: "Sentinelle",
            description: [
                "Une plateforme de prédiction des risques d'avalanche utilisant des modèles de Machine Learning développés sur mesure, destinée aux stations de ski.",
                "A platform for predicting avalanche risks using custom-made, from-scratch machine learning models, aimed to ski resorts.",
            ],
            fullDescription: [
                "Sentinelle est une plateforme de sécurité complète conçue pour les stations de ski. Elle utilise des modèles de machine learning sur mesure pour prédire les risques d'avalanche en analysant les données météorologiques en temps réel, l'état du manteau neigeux et les archives historiques. Le système fournit des informations exploitables aux équipes de sécurité des pistes, les aidant à prendre des décisions éclairées pour protéger les skieurs et les infrastructures. Développé avec un backend Rust haute performance et un frontend Angular moderne, Sentinelle garantit des temps de réponse inférieurs à la seconde même sous forte charge.",
                "Sentinelle is a comprehensive safety platform designed for ski resorts. It leverages custom machine learning models to predict avalanche risks by analyzing real-time weather data, snowpack conditions, and historical records. The system provides actionable insights to mountain safety teams, helping them make informed decisions to protect skiers and infrastructure. Built with a high-performance Rust backend and a modern Angular frontend, Sentinelle ensures sub-second response times even under heavy load.",
            ],
            // Laissé vide volontairement : le contenu d'origine était un
            // placeholder « Blabla ». À compléter depuis l'admin.
            architecture: ["", ""],
            tags: [
                ["IA", "Angular", "TensorFlow", "Rust"],
                ["AI", "Angular", "TensorFlow", "Rust"],
            ],
            imageId: sentinelleId,
            imageAlt: ["Site Web Sentinelle", "Sentinelle Website"],
            badge: ["En Ligne", "Live"],
            statusText: ["Actif", "Active"],
            actionType: "visit",
            actionUrl: "https://sentinelle.app",
        },
        {
            slug: "nexus-framework",
            title: "Nexus Framework",
            description: [
                "Un framework léger et modulaire pour écrire des services web haute performance en Rust. Actuellement utilisé au sein de Sentinelle.",
                "A lightweight and modular framework to write high-performance web services in Rust. Currently in use within Sentinelle.",
            ],
            fullDescription: [
                "Nexus Framework est un projet interne né du besoin d'un moyen hautement efficace, sûr au niveau des types et modulaire pour construire des services web en Rust. Il suit une architecture propre avec une séparation des préoccupations en couches. Il simplifie le développement d'API REST en fournissant des abstractions robustes sur Axum et Tokio, tout en conservant les avantages de performance du Rust pur. Il intègre un support natif pour l'observabilité, la gestion de la configuration et l'injection de dépendances.",
                "Nexus Framework is an internal project born from the need for a highly efficient, type-safe, and modular way to build web services in Rust. It follows a clean architecture with layered separation of concerns. It simplifies the development of REST APIs by providing robust abstractions over Axum and Tokio, while maintaining the performance benefits of pure Rust. It features built-in support for observability, configuration management, and dependency injection.",
            ],
            architecture: ["", ""],
            tags: [
                ["Rust", "Tokio", "Axum"],
                ["Rust", "Tokio", "Axum"],
            ],
            imageId: nexusFrameworkId,
            imageAlt: ["Nexus Framework", "Nexus Framework"],
            badge: ["0.1.1", "0.1.1"],
            statusText: ["Open Source", "Open Source"],
            actionType: "source",
            actionUrl: "https://github.com/SentinelleAI/nexus-framework",
        },
        {
            slug: "nexus",
            title: "Nexus",
            description: [
                "Le hub d'exécution IA de Sentinelle, permettant l'exécution de nos modèles de machine learning en moins de 150ms avec une haute concurrence et fiabilité.",
                "Sentinelle's AI execution hub, allows the execution of our machine learning models in under 150ms with high-concurrency and reliability.",
            ],
            fullDescription: [
                "Nexus est le moteur d'exécution derrière les capacités d'IA de Sentinelle. Il est conçu pour héberger et exécuter divers modèles de machine learning avec une latence minimale. En utilisant un cœur Rust hautement optimisé, Nexus peut gérer des milliers de requêtes simultanées tout en maintenant une latence p99 inférieure à 150 ms en conditions réelles. Il gère le chargement des modèles, la planification des inférences et la gestion des ressources, garantissant que les prédictions de sécurité critiques de Sentinelle sont toujours disponibles au moment opportun.",
                "Nexus is the execution engine behind Sentinelle's AI capabilities. It is designed to host and run various machine learning models with minimal latency. By using a highly optimized Rust core, Nexus can handle thousands of concurrent requests while maintaining a p99 latency below 150ms. It handles model loading, inference scheduling, and resource management, ensuring that the critical safety predictions of Sentinelle are always available when needed.",
            ],
            architecture: [
                "Nexus possède une fonctionnalité de découverte automatique des modèles de Machine Learning, et est ensuite capable de découvrir les Dockerfile correspondants afin de créer les images et lancer les conteneurs des différents modèles pour enfin être capable d'appeler les différents microservices correspondants. Cette manière de fonctionner nous a apporté une réduction des temps d'exécution de nos modèles de plus de 13x comparé à notre ancienne architecture, elle nous a également permis de passer, lors de tests intensifs, d'un taux d'erreur d'environ 50%, à 0. Prouvant que le système est capable d'une concurrence impressionnante malgré l'ampleur de la tâche qui lui est demandée.",
                "Nexus automatically discovers the available machine learning models, then locates their matching Dockerfiles to build the images and start each model's container, so it can finally call the corresponding microservices. This approach reduced our model execution times by more than 13x compared to our previous architecture, and took us from an error rate of roughly 50% down to 0 during intensive testing — proving the system handles impressive concurrency despite the scale of the work asked of it.",
            ],
            tags: [
                ["Rust", "Tokio", "Docker", "Machine Learning"],
                ["Rust", "Tokio", "Docker", "Machine Learning"],
            ],
            imageId: nexusId,
            imageAlt: ["Nexus", "Nexus"],
            badge: ["4.0.0", "4.0.0"],
            statusText: ["Déployé", "Deployed"],
            actionType: "info",
            actionUrl: null,
        },
    ];

    projects.forEach((project, index) => {
        run(
            `INSERT INTO projects
                (slug, title, description, full_description, architecture, tags,
                 image_id, image_alt, badge, status_text, action_type, action_url,
                 featured, position, visible)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1)`,
            project.slug,
            project.title,
            i18n(...project.description),
            i18n(...project.fullDescription),
            i18n(...project.architecture),
            i18nList(...project.tags),
            project.imageId,
            i18n(...project.imageAlt),
            i18n(...project.badge),
            i18n(...project.statusText),
            project.actionType,
            project.actionUrl,
            index,
        );
    });

    invalidateContent();
}
