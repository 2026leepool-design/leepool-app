const { withAndroidStyles, withAndroidManifest } = require('@expo/config-plugins');
const { assignStylesValue, getAppThemeGroup } = require('@expo/config-plugins/build/android/Styles');

module.exports = function withAndroidNavigationBar(config) {
  config = withAndroidStyles(config, (cfg) => {
    let styles = cfg.modResults;
    styles = assignStylesValue(styles, { parent: getAppThemeGroup(), name: 'android:navigationBarColor', value: '#000000', add: true });
    styles = assignStylesValue(styles, { parent: getAppThemeGroup(), name: 'android:windowLightNavigationBar', value: 'false', add: true });
    cfg.modResults = styles;
    return cfg;
  });
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (app?.$) {
      app.$['android:windowLightNavigationBar'] = 'false';
      app.$['android:navigationBarColor'] = '#000000';
    }
    return cfg;
  });
};
