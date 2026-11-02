const fs = require('node:fs');
const path = require('node:path');
const {
  AndroidConfig,
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withInfoPlist,
} = require('expo/config-plugins');
const base = require('./app.json');

function withCabzoneVoiceCallManifest(config) {
  config = AndroidConfig.Permissions.withPermissions(config, [
    'android.permission.MANAGE_OWN_CALLS',
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_PHONE_CALL',
    'android.permission.FOREGROUND_SERVICE_MICROPHONE',
    'android.permission.USE_FULL_SCREEN_INTENT',
    'android.permission.MODIFY_AUDIO_SETTINGS',
    'android.permission.RECORD_AUDIO',
    'android.permission.BLUETOOTH_CONNECT',
  ]);

  config = withAndroidManifest(config, (mod) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    // Local/internal builds use the LAN API; production must require HTTPS.
    app.$['android:usesCleartextTraffic'] = String(
      ['development', 'preview'].includes(process.env.EAS_BUILD_PROFILE) ||
        (!process.env.EAS_BUILD_PROFILE && process.env.NODE_ENV !== 'production'),
    );
    if (Array.isArray(app.service)) {
      const voiceService = app.service.find(
        (s) => s?.$?.['android:name'] === 'io.wazo.callkeep.VoiceConnectionService',
      );
      if (voiceService?.$) {
        voiceService.$['android:label'] = 'Cabzone';
        voiceService.$['android:foregroundServiceType'] = 'phoneCall|microphone';
      }
    }
    if (Array.isArray(app.activity)) {
      const mainActivity = app.activity.find((a) => a?.$?.['android:name'] === '.MainActivity');
      if (mainActivity?.$) {
        mainActivity.$['android:showWhenLocked'] = 'true';
        mainActivity.$['android:turnScreenOn'] = 'true';
      }
    }
    return mod;
  });

  config = withInfoPlist(config, (mod) => {
    const modes = new Set(Array.isArray(mod.modResults.UIBackgroundModes) ? mod.modResults.UIBackgroundModes : []);
    modes.add('audio');
    modes.add('voip');
    modes.add('remote-notification');
    mod.modResults.UIBackgroundModes = [...modes];
    return mod;
  });

  config = withAppBuildGradle(config, (mod) => {
    if (
      typeof mod.modResults.contents === 'string' &&
      !mod.modResults.contents.includes('CMAKE_OBJECT_PATH_MAX=245')
    ) {
      mod.modResults.contents = mod.modResults.contents.replace(
        'defaultConfig {',
        'externalNativeBuild {\n        cmake {\n            buildStagingDirectory file("${rootDir}/../../../.cxx/r").canonicalFile\n        }\n    }\n    defaultConfig {\n        externalNativeBuild {\n            cmake {\n                arguments "-DCMAKE_OBJECT_PATH_MAX=245"\n            }\n        }',
      );
    }
    return mod;
  });

  config = withDangerousMod(config, [
    'android',
    async (mod) => {
      const proguardPath = path.join(mod.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      if (fs.existsSync(proguardPath)) {
        const contents = fs.readFileSync(proguardPath, 'utf8');
        if (!contents.includes('livekit.org.jni_zero')) {
          fs.writeFileSync(
            proguardPath,
            `${contents}\n-dontwarn livekit.org.jni_zero.**\n-keep class livekit.org.** { *; }\n`,
          );
        }
      }
      return mod;
    },
  ]);

  return config;
}

module.exports = ({ config }) => {
  const expo = { ...base.expo, ...config };
  const projectId =
    process.env.RIDER_EAS_PROJECT_ID ||
    process.env.EAS_PROJECT_ID ||
    expo.extra?.eas?.projectId;
  const googleServicesFile =
    process.env.RIDER_GOOGLE_SERVICES_JSON ||
    process.env.GOOGLE_SERVICES_JSON ||
    (fs.existsSync(path.resolve(path.dirname(require.resolve('./app.json')), 'google-services.json'))
      ? './google-services.json'
      : undefined);

  const googleMapsApiKey =
    process.env.RIDER_GOOGLE_MAPS_API_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    '';

  const plugins = [
    ...(expo.plugins ?? []),
    [
      '@livekit/react-native-expo-plugin',
      {
        android: { audioType: 'communication', enableScreenShareService: false },
        ios: { enableMultitaskingCameraAccess: false },
      },
    ],
    [
      '@config-plugins/react-native-webrtc',
      {
        microphonePermission:
          'Allow Cabzone to access your microphone for private in-app ride calls.',
      },
    ],
    withCabzoneVoiceCallManifest,
    '@config-plugins/react-native-callkeep',
  ];

  return {
    ...expo,
    plugins,
    ios: {
      ...expo.ios,
      ...(googleMapsApiKey ? { config: { ...expo.ios?.config, googleMapsApiKey } } : {}),
    },
    android: {
      ...expo.android,
      ...(googleMapsApiKey
        ? { config: { ...expo.android?.config, googleMaps: { apiKey: googleMapsApiKey } } }
        : {}),
      blockedPermissions: [
        'android.permission.CAMERA',
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.CALL_PHONE',
        'android.permission.READ_PHONE_NUMBERS',
        'android.permission.READ_PHONE_STATE',
      ],
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
    extra: {
      ...expo.extra,
      ...(projectId
        ? {
            eas: {
              ...expo.extra?.eas,
              projectId,
            },
          }
        : {}),
    },
  };
};
