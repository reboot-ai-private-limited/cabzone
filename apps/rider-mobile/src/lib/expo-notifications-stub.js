// Stub for expo-notifications in Expo Go SDK 53+ when EXPO_USE_PUSH !== '1'
module.exports = {
  setNotificationHandler: () => {},
  getPermissionsAsync: async () => ({ status: 'undetermined', granted: false }),
  requestPermissionsAsync: async () => ({ status: 'denied', granted: false }),
  getExpoPushTokenAsync: async () => ({ data: '' }),
  setNotificationChannelAsync: async () => null,
  addNotificationReceivedListener: () => ({ remove: () => {} }),
  addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
  addPushTokenListener: () => ({ remove: () => {} }),
  getLastNotificationResponseAsync: async () => null,
  AndroidImportance: {
    MAX: 5,
    HIGH: 4,
    DEFAULT: 3,
  },
};
