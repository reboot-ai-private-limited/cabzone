export function computeKeyboardBottomPadding(params: {
  platform: string;
  keyboardHeight: number;
  restingContainerHeight: number;
  currentContainerHeight: number;
  baseBottomPadding: number;
}): number {
  const {
    platform,
    keyboardHeight,
    restingContainerHeight,
    currentContainerHeight,
    baseBottomPadding,
  } = params;

  if (keyboardHeight <= 0) {
    return baseBottomPadding;
  }

  if (platform === 'ios') {
    // KeyboardAvoidingView(behavior="padding") already insets the viewport on iOS;
    // keep breathing room for helper/error text and the floating Done chip.
    return Math.max(baseBottomPadding, 56);
  }

  const shrunkBy =
    restingContainerHeight > 0 && currentContainerHeight > 0
      ? Math.max(0, restingContainerHeight - currentContainerHeight)
      : 0;
  const uncompensatedKeyboardHeight = Math.max(0, keyboardHeight - shrunkBy);

  return Math.max(baseBottomPadding, uncompensatedKeyboardHeight + 64);
}

export function computeScrollDeltaForFocusedRect(params: {
  currentScrollY: number;
  containerTopY: number;
  containerHeight: number;
  keyboardScreenY: number;
  targetTopY: number;
  targetHeight: number;
  topClearance?: number;
  bottomClearance?: number;
}): number | null {
  const {
    currentScrollY,
    containerTopY,
    containerHeight,
    keyboardScreenY,
    targetTopY,
    targetHeight,
    topClearance = 24,
    bottomClearance = 88,
  } = params;

  if (!Number.isFinite(targetTopY) || !Number.isFinite(targetHeight) || containerHeight <= 0) {
    return null;
  }

  const visibleTop = containerTopY + topClearance;
  const containerBottomY = containerTopY + containerHeight;
  const effectiveBottomY =
    keyboardScreenY > 0 ? Math.min(containerBottomY, keyboardScreenY) : containerBottomY;
  const visibleBottom = effectiveBottomY - bottomClearance;

  if (visibleBottom <= visibleTop) {
    return Math.max(0, currentScrollY + (targetTopY - visibleTop));
  }

  if (targetTopY < visibleTop) {
    return Math.max(0, currentScrollY - (visibleTop - targetTopY));
  }

  const targetBottom = targetTopY + targetHeight;
  if (targetBottom > visibleBottom) {
    const overflow = targetBottom - visibleBottom;
    const maxScrollDown = Math.max(0, targetTopY - visibleTop);
    const delta = Math.min(overflow, maxScrollDown);
    if (delta < 2) return null;
    return Math.max(0, currentScrollY + delta);
  }

  return null;
}

export function resolveOperatingCitySelection(params: {
  selectedCity: string;
  isAddingCustom: boolean;
  customCity: string;
  supportedCityNames: readonly string[];
}): {
  canContinue: boolean;
  city: string;
  isCustomCity: boolean;
  prompt: string | null;
} {
  const { selectedCity, isAddingCustom, customCity, supportedCityNames } = params;
  const trimmedCustom = customCity.trim();

  const matchHub = (candidate: string) =>
    supportedCityNames.find((name) => name.toLowerCase() === candidate.toLowerCase());

  if (isAddingCustom && trimmedCustom.length > 0) {
    if (trimmedCustom.length < 3) {
      return {
        canContinue: false,
        city: '',
        isCustomCity: true,
        prompt: '• Enter at least 3 characters for your requested area',
      };
    }
    const hub = matchHub(trimmedCustom);
    return {
      canContinue: true,
      city: hub ?? trimmedCustom,
      isCustomCity: !hub,
      prompt: null,
    };
  }

  const trimmedSelected = selectedCity.trim();
  if (trimmedSelected.length >= 2) {
    const hub = matchHub(trimmedSelected);
    return {
      canContinue: true,
      city: hub ?? trimmedSelected,
      isCustomCity: !hub,
      prompt: null,
    };
  }

  return {
    canContinue: false,
    city: '',
    isCustomCity: false,
    prompt: '• Select an operating hub or request a new area to continue',
  };
}

export function getDrivingLicencePrompt(params: {
  hasFileOrSaved: boolean;
  dlNumber: string;
  expiryValid: boolean;
  expiryError?: string;
}): string | null {
  const { hasFileOrSaved, dlNumber, expiryValid, expiryError } = params;
  if (!hasFileOrSaved) {
    return '• Select your driving licence file above';
  }
  if (dlNumber.trim().length < 8) {
    return '• Enter a valid 8–16 character licence number';
  }
  if (!expiryValid) {
    return expiryError ? `• ${expiryError}` : '• Enter a valid future expiry date (DD/MM/YYYY)';
  }
  return null;
}
