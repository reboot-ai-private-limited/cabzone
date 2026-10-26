/**
 * No-op stub for expo-notifications in Expo Go (SDK 53+ removed remote push support).
 * Metro resolves to this file instead of the real package when IS_EXPO_GO is detected.
 */
const noop = () => {};
const noopAsync = async () => {};
const noopSub = { remove: noop };

module.exports = {
  setNotificationHandler: noop,
  getPermissionsAsync: async () => ({ status: 'denied' }),
  requestPermissionsAsync: async () => ({ status: 'denied' }),
  getExpoPushTokenAsync: async () => {
    throw new Error('Not available in Expo Go');
  },
  setNotificationChannelAsync: noopAsync,
  scheduleNotificationAsync: noopAsync,
  addNotificationResponseReceivedListener: () => noopSub,
  addNotificationReceivedListener: () => noopSub,
  getLastNotificationResponse: () => null,
  clearLastNotificationResponse: noop,
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3, LOW: 2, MIN: 1 },
};
