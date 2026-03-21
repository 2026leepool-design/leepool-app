/**
 * Android 11+ package visibility: allow resolving / opening lightning: URIs (LN wallets).
 * @param {import('@expo/config-plugins').ExportedConfig} config
 */
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withLightningAndroidQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    if (!manifest.queries) {
      manifest.queries = [];
    }

    const hasLightning = manifest.queries.some((q) => {
      const scheme = q.intent?.[0]?.data?.[0]?.$?.['android:scheme'];
      return scheme === 'lightning';
    });

    if (!hasLightning) {
      manifest.queries.push({
        intent: [
          {
            action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
            data: [{ $: { 'android:scheme': 'lightning' } }],
          },
        ],
      });
    }

    return cfg;
  });
}
