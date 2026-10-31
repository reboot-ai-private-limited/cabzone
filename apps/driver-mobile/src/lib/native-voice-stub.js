/**
 * No-op stub for native-only voice modules (@livekit/react-native,
 * @livekit/react-native-webrtc, react-native-callkeep) when bundling for Expo Go.
 * Metro resolves to this file only in local Expo Go mode (never in --push, EAS_BUILD, or production).
 */
const noop = () => {};
const noopAsync = async () => undefined;
const noopSub = { remove: noop };

const callKeepStub = {
  setup: async () => false,
  setAvailable: noop,
  displayIncomingCall: noop,
  backToForeground: noop,
  endCall: noop,
  endAllCalls: noop,
  answerIncomingCall: noop,
  setCurrentCallActive: noop,
  addEventListener: () => noopSub,
  removeEventListener: noop,
};

const AudioSession = {
  configureAudio: noopAsync,
  startAudioSession: noopAsync,
  stopAudioSession: noopAsync,
  selectAudioOutput: noopAsync,
  getAudioOutputs: () => [],
};

const AndroidAudioTypePresets = {
  communication: {},
  media: {},
};

module.exports = {
  __esModule: true,
  default: callKeepStub,
  registerGlobals: noop,
  AudioSession,
  AndroidAudioTypePresets,
  ...callKeepStub,
};
