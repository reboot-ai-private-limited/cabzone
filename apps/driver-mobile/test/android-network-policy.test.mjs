import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

// Exercise the manifest plugin without generating or modifying native projects.
for (const app of ['driver-mobile', 'rider-mobile']) {
  const configUrl = new URL(`../../${app}/app.config.js`, import.meta.url);
  const localRequire = createRequire(configUrl);
  for (const [env, allowed] of [
    [{}, true],
    [{ NODE_ENV: 'development' }, true],
    [{ NODE_ENV: 'production' }, false],
    [{ EAS_BUILD_PROFILE: 'development', NODE_ENV: 'production' }, true],
    [{ EAS_BUILD_PROFILE: 'preview', NODE_ENV: 'production' }, true],
    [{ EAS_BUILD_PROFILE: 'production', NODE_ENV: 'development' }, false],
    [{ EAS_BUILD_PROFILE: 'unknown' }, false],
  ]) {
    let manifestPlugin;
    const context = {
      module: { exports: {} },
      process: { env },
      require: (name) =>
        name === 'expo/config-plugins'
          ? {
              AndroidConfig: {
                Permissions: { withPermissions: (config) => config },
                Manifest: { getMainApplicationOrThrow: (manifest) => manifest.application[0] },
              },
              withAndroidManifest: (config, action) => {
                manifestPlugin = action;
                return config;
              },
              withInfoPlist: (config) => config,
              withAppBuildGradle: (config) => config,
              withDangerousMod: (config) => config,
            }
          : localRequire(name),
    };
    context.require.resolve = localRequire.resolve;
    vm.runInNewContext(readFileSync(configUrl, 'utf8'), context);
    // Production builds (EAS profile or a local NODE_ENV=production release) must use HTTPS.
    const isProduction =
      env.EAS_BUILD_PROFILE === 'production' ||
      (env.NODE_ENV === 'production' && !['development', 'preview'].includes(env.EAS_BUILD_PROFILE));
    if (isProduction) {
      assert.throws(() => context.module.exports({ config: {} }), /HTTPS API origin/);
      env.EXPO_PUBLIC_API_URL = 'http://api.example.com';
      assert.throws(() => context.module.exports({ config: {} }), /HTTPS API origin/);
      env.EXPO_PUBLIC_API_URL = 'https://api.example.com';
    }
    const resolved = context.module.exports({ config: {} });
    resolved.plugins.find((plugin) => typeof plugin === 'function')(resolved);
    const application = { $: {} };
    manifestPlugin({ modResults: { application: [application] } });
    assert.equal(
      application.$['android:usesCleartextTraffic'],
      String(allowed),
      `${app}: incorrect cleartext policy for ${JSON.stringify(env)}`,
    );
  }
}
console.log('Both apps: local/development/preview HTTP allowed; production HTTP blocked.');
