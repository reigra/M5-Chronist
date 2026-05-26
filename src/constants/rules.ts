/**
 * GitHub-Konfiguration für den automatischen Download von Regelwerk-Releases.
 *
 * RULES_RELEASE_REF kann sein:
 *   'latest'              → immer das neueste Release
 *   'release-2026-05-26'  → ein konkreter Release-Tag
 *
 * Die JSON-Dateien müssen beim Erstellen des GitHub-Releases als Assets
 * hochgeladen werden (nicht nur der automatisch generierte Source-Code-ZIP).
 */
export const RULES_GITHUB_REPO = 'MidgardRPG/Midgard-M5-Rules'
export const RULES_RELEASE_REF = 'release-2026-05-26'
