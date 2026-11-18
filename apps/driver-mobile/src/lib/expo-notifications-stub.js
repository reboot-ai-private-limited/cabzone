/**
 * No-op stub for expo-notifications in Expo Go (SDK 53+ removed remote push support).
 * Metro resolves to this file only in local Expo Go mode (never in --push, EAS_BUILD, or production).
 */
const noop = () => {};
const noopAsync = async () => null;
const noopSub = { remove: noop };

module.exports = {
  setNotificationHandler: noop,
  getPermissionsAsync: async () => ({ status: 'denied', granted: false }),
  requestPermissionsAsync: async () => ({ status: 'denied', granted: false }),
  getDevicePushTokenAsync: async () => {
    throw new Error('Remote push requires a Cabzone development or release build');
  },
  getExpoPushTokenAsync: async () => {
    throw new Error('Remote push requires a Cabzone development or release build');
  },
  setNotificationChannelAsync: noopAsync,
  setNotificationCategoryAsync: noopAsync,
  scheduleNotificationAsync: noopAsync,
  dismissNotificationAsync: noopAsync,
  registerTaskAsync: noopAsync,
  addNotificationResponseReceivedListener: () => noopSub,
  addNotificationReceivedListener: () => noopSub,
  addPushTokenListener: () => noopSub,
  getLastNotificationResponse: () => null,
  getLastNotificationResponseAsync: noopAsync,
  clearLastNotificationResponse: noop,
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3, LOW: 2, MIN: 1 },
  AndroidNotificationVisibility: { PUBLIC: 1, PRIVATE: 0, SECRET: -1 },
  AndroidAudioUsage: { NOTIFICATION_RINGTONE: 6, NOTIFICATION: 5, ALARM: 4 },
  AndroidAudioContentType: { SONIFICATION: 4, MUSIC: 2, SPEECH: 1, MOVIE: 3, UNKNOWN: 0 },
  AndroidNotificationPriority: { MAX: 'max', HIGH: 'high', DEFAULT: 'default', LOW: 'low', MIN: 'min' },
};
