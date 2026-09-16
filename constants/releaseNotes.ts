/**
 * In-app “what’s new” copy for the current store version (see app.json → expo.version).
 * Update `LINES` when you ship a new release. Bullets are English by product request.
 *
 * Summary basis: `git log --since="36 hours ago"` on the release branch (covers ~last day
 * when strict 12h has no commits) plus v4.0 features staged for this APK.
 */
export const RELEASE_NOTES_LINES: string[] = [
  'Release 4.3.8: three improvements from Linear LEE-61 through LEE-63 are now included.',
  'Welcome: the animated intro and login screen now use the same LeePool medallion.',
  'Login: Russian is available in the language selector with its flag.',
  'Bitcoin: hashrate now has its own mining dropdown with current difficulty, next adjustment, and remaining blocks.',
  'Release 4.3.5: five improvements from Linear LEE-55 through LEE-59 are now included.',
  'Books: replaced the duplicate metadata page field with Publisher and removed the translator field from adding books.',
  'Dashboard: the library value chart now uses real book value history from Supabase.',
  'Bitcoin: added current network hashrate in EH/s and RUB as a display currency.',
  'Welcome: corrected the LeePool medallion so the blue mark stays inside its rounded square.',
  'Release 4.3.0: ten improvements from Linear LEE-30 and LEE-46 through LEE-54 are being prepared.',
  'Library: track lent and gifted books, filter them, and prevent unavailable books from being listed for sale.',
  'Dashboard: new Prestados and Regalados summary cards link directly to their library filters.',
  'Market: the wishlist control now uses only the heart icon.',
  'Reading: circular progress renders consistently when switching back and forth from the linear bar.',
  'Books: removed the translator field from book details and editing.',
  'Notifications: added a bell shortcut and push delivery for messages and P2P offers.',
  'Android: the system navigation bar is forced to dark mode.',
  'Welcome: the profile shortcut was removed from the welcome message.',
  'IA Sync: the Gemini Supabase Edge Function is deployed and ready for the encrypted project secret.',
  'Release 4.2.0: seven improvements from Linear LEE-39 through LEE-45 are now included.',
  'Navigation: web tab labels are readable and Wallet is available between My Library and Market.',
  'Wallet: view the connected Nostr Wallet Connect balance directly in the new Wallet tab.',
  'Market: toggle the Deseados filter next to the LIVE and filters controls.',
  'Dashboard: switch unfinished-book progress between a linear bar and a circular percentage view.',
  'Bitcoin: the mempool fee dropdown now expands in the layout without covering dashboard cards.',
  'Launcher: adaptive Android icon corners are transparent so the round LeePool mark renders cleanly.',
  'Release 4.1.3: seven improvements from Linear LEE-32 through LEE-38 are now included.',
  'Release 4.1.3: seven improvements from Linear LEE-32 through LEE-38 are now included.',
  'Launcher: new round LeePool icon, black bottom navigation, and About LeePool version information in Profile.',
  'Bitcoin: current mempool block height and sat/vB fee priorities are available beside the currency selector.',
  'Navigation: dashboard cards open their corresponding library, market, finished, reading, or wishlist view.',
  'Wishlist: save market books with the heart icon and return to them from the dashboard.',
  'Android: the release APK is named leepool_v4.1.3.apk.',
  'Dashboard 4.0.6: six clear library indicators for total books, value, sales, finished, reading, and wishlist.',
  'Bookmarks: one progress bar per unfinished book; finished books no longer appear in this view.',
  'Currency display: choose USD, EUR, TRY, BTC, or sats from the dashboard and keep the selection for your next visit.',
  'Navigation: language selection is now grouped under the world icon and profile/settings under the settings icon.',
  'Android: black system toolbar with content positioned inside the safe area for better visibility.',
  'IA Sync: more reliable multilingual synopsis generation and validation when Gemini returns unexpected formatting.',
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
