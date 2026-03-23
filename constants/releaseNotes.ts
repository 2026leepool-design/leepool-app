/**
 * In-app “what’s new” copy for the current store version (see app.json → expo.version).
 * Update `LINES` when you ship a new release. Bullets are English by product request.
 *
 * Summary basis: `git log --since="36 hours ago"` on the release branch (covers ~last day
 * when strict 12h has no commits) plus v4.0 features staged for this APK.
 */
export const RELEASE_NOTES_LINES: string[] = [
  'P2P chat: optional in-thread location sharing (permission-based), clearer display of shared places, and related copy updates.',
  'Dashboard: import an existing Nostr secret key (nsec) with your LeePool password, with improved validation and errors.',
  'Sign-in & keys: more reliable secure storage across platforms and clearer error logging on login and startup.',
  'Books & Lightning: smoother Lightning address handling in book flows; refinements to login, dashboard, and cloud sync.',
  'Media stack: expo-av available for richer attachments; expo-location and expo-localization wired for location-aware UX.',
  'Market: filter for-sale listings by price range, title, author, and condition; sort by listing date, price, or title.',
  'Add / edit book: title-based web search ranks hits that match the author already on your form at the top of the list.',
];

export function releaseNotesDismissStorageKey(appVersion: string): string {
  const safe = appVersion.replace(/[^0-9a-zA-Z._-]/g, '_');
  return `leepool_release_notes_never_${safe}`;
}
