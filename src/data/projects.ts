import type { Lang } from "./config";

export interface Project {
    id: string;
    title: string;
    description: string;
    fullDescription: string;
    architecture: string;
    tags: string[];
    image: string;
    imageAlt: string;
    badge: string;
    statusText: string;
    actionType: "source" | "info" | "visit";
    actionUrl?: string;
}

export const PROJECTS: Record<Lang, Project[]> = {
    en: [
        {
            id: "sentinelle",
            title: "Sentinelle",
            description: "A platform for predicting avalanche risks using custom-made, from-scratch machine learning models, aimed to ski resorts.",
            fullDescription: "Sentinelle is a comprehensive safety platform designed for ski resorts. It leverages custom machine learning models to predict avalanche risks by analyzing real-time weather data, snowpack conditions, and historical records. The system provides actionable insights to mountain safety teams, helping them make informed decisions to protect skiers and infrastructure. Built with a high-performance Rust backend and a modern Angular frontend, Sentinelle ensures sub-second response times even under heavy load.",
            architecture: "Blabla",
            tags: ["AI", "Angular", "TensorFlow", "Rust"],
            image: "/sentinelle.png",
            imageAlt: "Sentinelle Website",
            badge: "Live",
            statusText: "Active",
            actionType: "visit",
            actionUrl: "https://sentinelle.app",
        },
        {
            id: "nexus-framework",
            title: "Nexus Framework",
            description: "A lightweight and modular framework to write high-performance web services in Rust. Currently in use within Sentinelle.",
            fullDescription: "Nexus Framework is an internal project born from the need for a highly efficient, type-safe, and modular way to build web services in Rust. It follows a clean architecture with layered separation of concerns. It simplifies the development of REST APIs by providing robust abstractions over Axum and Tokio, while maintaining the performance benefits of pure Rust. It features built-in support for observability, configuration management, and dependency injection.",
            architecture: "Blabla",
            tags: ["Rust", "Tokio", "Axum"],
            image: "/nexus-framework.png",
            imageAlt: "Trading Bot Interface",
            badge: "0.1.1",
            statusText: "Open Source",
            actionType: "source",
            actionUrl: "https://github.com/SentinelleAI/nexus-framework",
        },
        {
            id: "nexus",
            title: "Nexus",
            description: "Sentinelle's AI execution hub, allows the execution of our machine learning models in under 150ms with high-concurrency and reliability.",
            fullDescription: "Nexus is the execution engine behind Sentinelle's AI capabilities. It is designed to host and run various machine learning models with minimal latency. By using a highly optimized Rust core, Nexus can handle thousands of concurrent requests while maintaining a p99 latency below 150ms. It handles model loading, inference scheduling, and resource management, ensuring that the critical safety predictions of Sentinelle are always available when needed.",
            architecture: "Blabla",
            tags: ["Rust", "Tokio", "Docker", "Machine Learning"],
            image: "/nexus.png",
            imageAlt: "Code Editor",
            badge: "4.0.0",
            statusText: "Deployed",
            actionType: "info",
        },
    ],
    fr: [
        {
            id: "sentinelle",
            title: "Sentinelle",
            description: "Une plateforme de prédiction des risques d'avalanche utilisant des modèles de Machine Learning développés sur mesure, destinée aux stations de ski.",
            fullDescription: "Sentinelle est une plateforme de sécurité complète conçue pour les stations de ski. Elle utilise des modèles de machine learning sur mesure pour prédire les risques d'avalanche en analysant les données météorologiques en temps réel, l'état du manteau neigeux et les archives historiques. Le système fournit des informations exploitables aux équipes de sécurité des pistes, les aidant à prendre des décisions éclairées pour protéger les skieurs et les infrastructures. Développé avec un backend Rust haute performance et un frontend Angular moderne, Sentinelle garantit des temps de réponse inférieurs à la seconde même sous forte charge.",
            architecture: "Blabla",
            tags: ["AI", "Angular", "TensorFlow", "Rust"],
            image: "/sentinelle.png",
            imageAlt: "Site Web Sentinelle",
            badge: "En Ligne",
            statusText: "Actif",
            actionType: "visit",
            actionUrl: "https://sentinelle.app",
        },
        {
            id: "nexus-framework",
            title: "Nexus Framework",
            description: "Un framework léger et modulaire pour écrire des services web haute performance en Rust. Actuellement utilisé au sein de Sentinelle.",
            fullDescription: "Nexus Framework est un projet interne né du besoin d'un moyen hautement efficace, sûr au niveau des types et modulaire pour construire des services web en Rust. Il suit une architecture propre avec une séparation des préoccupations en couches. Il simplifie le développement d'API REST en fournissant des abstractions robustes sur Axum et Tokio, tout en conservant les avantages de performance du Rust pur. Il intègre un support natif pour l'observabilité, la gestion de la configuration et l'injection de dépendances.",
            architecture: "Blabla",
            tags: ["Rust", "Tokio", "Axum"],
            image: "/nexus-framework.png",
            imageAlt: "Interface Nexus",
            badge: "0.1.1",
            statusText: "Open Source",
            actionType: "source",
            actionUrl: "https://github.com/SentinelleAI/nexus-framework",
        },
        {
            id: "nexus",
            title: "Nexus",
            description: "Le hub d'exécution IA de Sentinelle, permettant l'exécution de nos modèles de machine learning en moins de 150ms avec une haute concurrence et fiabilité.",
            fullDescription: "Nexus est le moteur d'exécution derrière les capacités d'IA de Sentinelle. Il est conçu pour héberger et exécuter divers modèles de machine learning avec une latence minimale. En utilisant un cœur Rust hautement optimisé, Nexus peut gérer des milliers de requêtes simultanées tout en maintenant une latence p99 inférieure à 150 ms en conditions réelles. Il gère le chargement des modèles, la planification des inférences et la gestion des ressources, garantissant que les prédictions de sécurité critiques de Sentinelle sont toujours disponibles au moment opportun.",
            architecture: "Nexus possède une fonctionnalité de découverte automatique des modèles de Machine Learning, et est ensuite capable de découvrir les Dockerfile correspondants afin de créer les images et lancer les conteneurs des différents modèles pour enfin être capable d'appeler les différents microservices correspondants. Cette manière de fonctionner nous a apporté une réduction des temps d'exécution de nos modèles de plus de 13x comparé à notre ancienne architecture, elle nous a également permis de passer, lors de tests intensifs, d'un taux d'erreur d'environ 50%, à 0. Prouvant que le système est capable d'une concurrence impressionante malgré l'ampleur de la tâche qui lui est demandée.",
            tags: ["Rust", "Tokio", "Docker", "Machine Learning"],
            image: "/nexus.png",
            imageAlt: "Éditeur de Code",
            badge: "4.0.0",
            statusText: "Déployé",
            actionType: "info",
        },
    ],
};
