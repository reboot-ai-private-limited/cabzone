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
  getExpoPushTokenAsync: async () => {
    throw new Error('Remote push requires a Cabzone development or release build');
  },
  setNotificationChannelAsync: noopAsync,
  scheduleNotificationAsync: noopAsync,
  addNotificationReceivedListener: () => noopSub,
  addNotificationResponseReceivedListener: () => noopSub,
  addPushTokenListener: () => noopSub,
  getLastNotificationResponseAsync: noopAsync,
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3, LOW: 2, MIN: 1 },
};
