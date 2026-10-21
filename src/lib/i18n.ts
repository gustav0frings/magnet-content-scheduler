export type UiLang = "en" | "fr";

export const UI_LANGS: { id: UiLang; label: string }[] = [
  { id: "en", label: "English" },
  { id: "fr", label: "Français" },
];

export const COOKIE_LANG = "magnet_scheduler_lang";
export const COOKIE_DEVICE = "magnet_scheduler_device";

export const messages = {
  en: {
    title: "Content Scheduler",
    subtitle: "Your videos for the next 7 days.",
    device: "Device",
    language: "Language",
    country: "Country",
    allDevices: "All devices",
    allCountries: "All countries",
    today: "Today",
    download: "Download",
    saved: "saved",
    showingDevice: "Showing {name} · {country}",
    showingCountry: "Showing country {country}",
    showingAll: "Showing all devices",
    modalTitle: "Welcome",
    modalLang: "Choose your language",
    modalDevice: "Choose your device",
    modalContinue: "Continue",
    modalNext: "Next",
    changeSetup: "Change device / language",
    empty: "—",
    footer: "Inbox API",
  },
  fr: {
    title: "Content Scheduler",
    subtitle: "Tes vidéos pour les 7 prochains jours.",
    device: "Appareil",
    language: "Langue",
    country: "Pays",
    allDevices: "Tous les appareils",
    allCountries: "Tous les pays",
    today: "Aujourd’hui",
    download: "Télécharger",
    saved: "enregistré",
    showingDevice: "Affichage : {name} · {country}",
    showingCountry: "Affichage pays : {country}",
    showingAll: "Tous les appareils",
    modalTitle: "Bienvenue",
    modalLang: "Choisis ta langue",
    modalDevice: "Choisis ton appareil",
    modalContinue: "Continuer",
    modalNext: "Suivant",
    changeSetup: "Changer appareil / langue",
    empty: "—",
    footer: "API inbox",
  },
} as const;
