const config = require('./app.json').expo;

config.extra = {
  ...config.extra,
  eas: {
    ...config.extra?.eas,
    projectId: process.env.EAS_PROJECT_ID ?? config.extra?.eas?.projectId,
  },
};

module.exports = { expo: config };
