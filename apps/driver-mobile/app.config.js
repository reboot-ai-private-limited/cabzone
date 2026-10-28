const fs = require('node:fs');
const path = require('node:path');
const base = require('./app.json');

module.exports = ({ config }) => {
  const expo = { ...base.expo, ...config };
  const projectId =
    process.env.DRIVER_EAS_PROJECT_ID ||
    process.env.EAS_PROJECT_ID ||
    expo.extra?.eas?.projectId;
  const googleServicesFile =
    process.env.DRIVER_GOOGLE_SERVICES_JSON ||
    process.env.GOOGLE_SERVICES_JSON ||
    (fs.existsSync(path.resolve(path.dirname(require.resolve('./app.json')), 'google-services.json'))
      ? './google-services.json'
      : undefined);

  return {
    ...expo,
    android: {
      ...expo.android,
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
