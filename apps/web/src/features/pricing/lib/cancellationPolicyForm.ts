import {
  DEFAULT_CANCELLATION_FEE_PAISE,
  DEFAULT_DRIVER_COMPENSATION_PAISE,
  DEFAULT_DRIVER_NO_SHOW_WAIT_SECONDS,
  DEFAULT_RIDER_CANCELLATION_GRACE_SECONDS,
  type PricingConfigDto,
} from '@cabzone/contracts';

export interface CancellationPolicyFormDefaults {
  cancellationFeeRupees: string;
  driverCompensationRupees: string;
  riderCancellationGraceSeconds: string;
  driverNoShowWaitSeconds: string;
}

export interface ValidatedCancellationPolicyPayload {
  cancellationFeePaise: number;
  driverCompensationPaise: number;
  platformCancellationFeePaise: number;
  riderCancellationGraceSeconds: number;
  driverNoShowWaitSeconds: number;
}

export function parseRupeesToPaise(raw: string | number): number | null {
  const str = String(raw).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(str)) return null;
  const [whole = '0', frac = ''] = str.split('.');
  const rupees = Number(whole);
  const paisePart = Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(rupees) || !Number.isSafeInteger(paisePart)) return null;
  const total = rupees * 100 + paisePart;
  return Number.isSafeInteger(total) && total >= 0 ? total : null;
}

function formatPaiseAsRupeeInput(paise: number): string {
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}

export function resolveCancellationPolicyDefaults(
  config: Partial<PricingConfigDto> | null | undefined,
): CancellationPolicyFormDefaults {
  const feePaise =
    typeof config?.cancellationFeePaise === 'number' && Number.isFinite(config.cancellationFeePaise)
      ? config.cancellationFeePaise
      : DEFAULT_CANCELLATION_FEE_PAISE;
  const driverCompPaise =
    typeof config?.driverCompensationPaise === 'number' &&
    Number.isFinite(config.driverCompensationPaise)
      ? config.driverCompensationPaise
      : Math.min(feePaise, DEFAULT_DRIVER_COMPENSATION_PAISE);
  const graceSeconds =
    typeof config?.riderCancellationGraceSeconds === 'number' &&
    Number.isFinite(config.riderCancellationGraceSeconds)
      ? config.riderCancellationGraceSeconds
      : DEFAULT_RIDER_CANCELLATION_GRACE_SECONDS;
  const noShowSeconds =
    typeof config?.driverNoShowWaitSeconds === 'number' &&
    Number.isFinite(config.driverNoShowWaitSeconds)
      ? config.driverNoShowWaitSeconds
      : DEFAULT_DRIVER_NO_SHOW_WAIT_SECONDS;

  return {
    cancellationFeeRupees: formatPaiseAsRupeeInput(feePaise),
    driverCompensationRupees: formatPaiseAsRupeeInput(driverCompPaise),
    riderCancellationGraceSeconds: String(graceSeconds),
    driverNoShowWaitSeconds: String(noShowSeconds),
  };
}

export function validateAndBuildCancellationPolicy(
  input: CancellationPolicyFormDefaults,
): { ok: true; value: ValidatedCancellationPolicyPayload } | { ok: false; error: string } {
  const cancellationFeePaise = parseRupeesToPaise(input.cancellationFeeRupees);
  if (cancellationFeePaise === null) {
    return {
      ok: false,
      error: 'Cancellation fee must be a valid non-negative rupee amount (up to 2 decimal places).',
    };
  }

  const driverCompensationPaise = parseRupeesToPaise(input.driverCompensationRupees);
  if (driverCompensationPaise === null) {
    return {
      ok: false,
      error:
        'Driver compensation share must be a valid non-negative rupee amount (up to 2 decimal places).',
    };
  }

  if (driverCompensationPaise > cancellationFeePaise) {
    return {
      ok: false,
      error: 'Driver compensation share cannot exceed total cancellation fee.',
    };
  }

  const graceStr = String(input.riderCancellationGraceSeconds).trim();
  const riderCancellationGraceSeconds = /^\d+$/.test(graceStr) ? Number(graceStr) : Number.NaN;
  if (
    !Number.isSafeInteger(riderCancellationGraceSeconds) ||
    riderCancellationGraceSeconds < 0 ||
    riderCancellationGraceSeconds > 3600
  ) {
    return {
      ok: false,
      error: 'Rider cancellation grace window must be an integer between 0 and 3600 seconds.',
    };
  }

  const noShowStr = String(input.driverNoShowWaitSeconds).trim();
  const driverNoShowWaitSeconds = /^\d+$/.test(noShowStr) ? Number(noShowStr) : Number.NaN;
  if (
    !Number.isSafeInteger(driverNoShowWaitSeconds) ||
    driverNoShowWaitSeconds < 0 ||
    driverNoShowWaitSeconds > 3600
  ) {
    return {
      ok: false,
      error: 'Driver no-show wait timer must be an integer between 0 and 3600 seconds.',
    };
  }

  const platformCancellationFeePaise = cancellationFeePaise - driverCompensationPaise;

  return {
    ok: true,
    value: {
      cancellationFeePaise,
      driverCompensationPaise,
      platformCancellationFeePaise,
      riderCancellationGraceSeconds,
      driverNoShowWaitSeconds,
    },
  };
}
