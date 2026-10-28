import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  computeKeyboardBottomPadding,
  computeScrollDeltaForFocusedRect,
  getDrivingLicencePrompt,
  resolveOperatingCitySelection,
} from './onboarding-ux-helpers.ts';

test('computeKeyboardBottomPadding compensates Android edge-to-edge keyboard without double-counting adjustResize or iOS padding', () => {
  // Keyboard closed -> returns base padding
  assert.equal(
    computeKeyboardBottomPadding({
      platform: 'android',
      keyboardHeight: 0,
      restingContainerHeight: 820,
      currentContainerHeight: 820,
      baseBottomPadding: 48,
    }),
    48,
  );

  // Android edge-to-edge (container height unchanged when keyboard opens) -> full keyboardHeight + clearance
  assert.equal(
    computeKeyboardBottomPadding({
      platform: 'android',
      keyboardHeight: 300,
      restingContainerHeight: 820,
      currentContainerHeight: 820,
      baseBottomPadding: 48,
    }),
    364,
  );

  // Android adjustResize (container shrunk by keyboardHeight) -> avoids double-padding
  assert.equal(
    computeKeyboardBottomPadding({
      platform: 'android',
      keyboardHeight: 300,
      restingContainerHeight: 820,
      currentContainerHeight: 520,
      baseBottomPadding: 48,
    }),
    64,
  );

  // iOS (KeyboardAvoidingView already pads viewport) -> comfortable clearance without double-padding
  assert.equal(
    computeKeyboardBottomPadding({
      platform: 'ios',
      keyboardHeight: 310,
      restingContainerHeight: 820,
      currentContainerHeight: 820,
      baseBottomPadding: 44,
    }),
    56,
  );
});

test('computeScrollDeltaForFocusedRect scrolls occluded inputs + error lines above the keyboard', () => {
  // Input at y=510 (height 52) when keyboard top is y=540 -> occluded once 88px clearance is accounted for
  const scrollDown = computeScrollDeltaForFocusedRect({
    currentScrollY: 100,
    containerTopY: 0,
    containerHeight: 820,
    keyboardScreenY: 540,
    targetTopY: 510,
    targetHeight: 52,
  });
  // visibleBottom = 540 - 88 = 452; targetBottom = 562; overflow = 110 -> nextY = 210
  assert.equal(scrollDown, 210);

  // Input already comfortably visible in upper half -> null (no jitter)
  const noScroll = computeScrollDeltaForFocusedRect({
    currentScrollY: 120,
    containerTopY: 0,
    containerHeight: 820,
    keyboardScreenY: 540,
    targetTopY: 220,
    targetHeight: 52,
  });
  assert.equal(noScroll, null);

  // Input clipped above top safe edge -> scrolls back up
  const scrollUp = computeScrollDeltaForFocusedRect({
    currentScrollY: 200,
    containerTopY: 40,
    containerHeight: 780,
    keyboardScreenY: 540,
    targetTopY: 30,
    targetHeight: 52,
  });
  // visibleTop = 40 + 24 = 64; targetTopY = 30 -> scroll up by 34 -> 166
  assert.equal(scrollUp, 166);
});

test('resolveOperatingCitySelection auto-applies 3+ char custom area on Continue and matches known hubs', () => {
  const hubs = ['Siliguri', 'Bagdogra / Airport', 'Jalpaiguri'];

  // Typed custom area >= 3 chars can continue directly without forcing an extra Apply tap
  const customReady = resolveOperatingCitySelection({
    selectedCity: '',
    isAddingCustom: true,
    customCity: '  Raiganj ',
    supportedCityNames: hubs,
  });
  assert.deepEqual(customReady, {
    canContinue: true,
    city: 'Raiganj',
    isCustomCity: true,
    prompt: null,
  });

  // Typed custom area matching an active hub normalizes to active hub
  const matchedHub = resolveOperatingCitySelection({
    selectedCity: '',
    isAddingCustom: true,
    customCity: 'siliguri',
    supportedCityNames: hubs,
  });
  assert.deepEqual(matchedHub, {
    canContinue: true,
    city: 'Siliguri',
    isCustomCity: false,
    prompt: null,
  });

  // Too-short custom area blocks with clear prompt
  const tooShort = resolveOperatingCitySelection({
    selectedCity: 'Siliguri',
    isAddingCustom: true,
    customCity: 'Ra',
    supportedCityNames: hubs,
  });
  assert.equal(tooShort.canContinue, false);
  assert.match(tooShort.prompt ?? '', /at least 3 characters/);
});

test('getDrivingLicencePrompt surfaces actionable step-by-step guidance', () => {
  assert.equal(
    getDrivingLicencePrompt({
      hasFileOrSaved: false,
      dlNumber: '',
      expiryValid: false,
    }),
    '• Select your driving licence file above',
  );
  assert.equal(
    getDrivingLicencePrompt({
      hasFileOrSaved: true,
      dlNumber: 'WB74',
      expiryValid: false,
    }),
    '• Enter a valid 8–16 character licence number',
  );
  assert.equal(
    getDrivingLicencePrompt({
      hasFileOrSaved: true,
      dlNumber: 'WB7420220012345',
      expiryValid: false,
      expiryError: 'Expiry date must be in the future.',
    }),
    '• Expiry date must be in the future.',
  );
  assert.equal(
    getDrivingLicencePrompt({
      hasFileOrSaved: true,
      dlNumber: 'WB7420220012345',
      expiryValid: true,
    }),
    null,
  );
});
