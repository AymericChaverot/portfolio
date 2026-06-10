export type Lang = 'en' | 'fr';

export const SITE_CONFIG: {
    name: string;
    socials: {
        name: string;
        url: string;
        icon: string;
        text?: string;
    }[];
    allProjects: {
        en: string;
        fr: string;
    };
    en: LocaleConfig;
    fr: LocaleConfig;
} = {
    name: "Aymeric Chaverot",
    socials: [
        {
            name: "GitHub",
            url: "https://github.com/AymericChaverot",
            icon: "link"
        },
        {
            name: "LinkedIn",
            url: "https://www.linkedin.com/in/AymericChaverot/",
            icon: "link"
        },
        {
            name: "Email",
            url: "mailto:achaverot.dev@pm.me",
            icon: "email",
        },
    ],
    allProjects: {
        en: "/en/projects",
        fr: "/fr/projects",
    },
    en: {
        role: "Systems Engineer & Software Architect",
        description: "Specializing in high-performance infrastructure, distributed systems, and low-level engineering. I build robust solutions where efficiency meets scalability.",
        status: {
            available: false,
            text: "Currently in position @ Thales"
        },
        nav: {
            about: "About",
            expertise: "Expertise",
            experience: "Experience",
            projects: "Projects",
            contact: "Contact Me"
        },
        contact: {
            sendEmail: "Send Email"
        }
    },
    fr: {
        role: "Ingénieur Système & Architecte Logiciel",
        description: "Spécialisé dans l'infrastructure haute performance, les systèmes distribués et l'ingénierie bas niveau. Je conçois des solutions robustes où l'efficacité rencontre l'évolutivité.",
        status: {
            available: false,
            text: "Actuellement en poste @ Thales"
        },
        nav: {
            about: "À propos",
            expertise: "Expertise",
            experience: "Expériences",
            projects: "Projets",
            contact: "Me Contacter"
        },
        contact: {
            sendEmail: "Envoyer un email"
        }
    }
};

interface LocaleConfig {
    role: string;
    description: string;
    status: {
        available: boolean;
        text: string;
    };
    nav: {
        about: string;
        expertise: string;
        experience: string;
        projects: string;
        contact: string;
    };
    contact: {
        sendEmail: string;
    };
}
