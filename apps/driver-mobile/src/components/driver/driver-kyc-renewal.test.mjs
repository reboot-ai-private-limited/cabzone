import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const ts = createRequire(import.meta.url)('typescript');

function loadTsModule(relPath, mocks = {}) {
  const code = ts.transpileModule(readFileSync(new URL(relPath, import.meta.url), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  }).outputText;

  const mod = { exports: {} };
  vm.runInNewContext(code, {
    exports: mod.exports,
    module: mod,
    __DEV__: false,
    Date,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Set,
    Map,
    RegExp,
    Error,
    Promise,
    require: (spec) => {
      if (spec in mocks) return mocks[spec];
      return {};
    },
  });
  return mod.exports;
}

const profileMod = loadTsModule('../../services/profile.ts');

test('canAccessDriverShell routes ACTIVE + EXPIRED drivers into driver shell without onboarding loop', () => {
  assert.equal(profileMod.canAccessDriverShell(null), false);
  assert.equal(profileMod.canAccessDriverShell({ status: 'PENDING', kycStatus: 'PENDING' }), false);
  assert.equal(profileMod.canAccessDriverShell({ status: 'SUSPENDED', kycStatus: 'VERIFIED' }), false);
  assert.equal(profileMod.canAccessDriverShell({ status: 'REJECTED', kycStatus: 'FAILED' }), false);

  assert.equal(profileMod.canAccessDriverShell({ status: 'ACTIVE', kycStatus: 'VERIFIED' }), true);
  assert.equal(profileMod.canAccessDriverShell({ status: 'ACTIVE', kycStatus: 'EXPIRED' }), true);
  assert.equal(profileMod.canAccessDriverShell({ status: 'ACTIVE', kycStatus: 'PENDING' }), true);
});

test('deriveKycBannerState surfaces warning, urgent, expired, under-review, and fixable rejection states', () => {
  const baseProfile = {
    driver: { id: 'd1', status: 'ACTIVE', kycStatus: 'VERIFIED' },
    application: { id: 'a1', status: 'APPROVED', rejectionType: null, rejectionReason: null },
    compliance: {
      overallStatus: 'COMPLIANT',
      canRenew: false,
      hasPendingRenewal: false,
      nextExpiryAt: '2027-06-01T23:59:59.999Z',
      expiringSoonCount: 0,
      expiredCount: 0,
      missingCount: 0,
      items: [],
    },
  };

  assert.equal(profileMod.deriveKycBannerState(baseProfile), null);

  // 20 days remaining -> warning
  const warningBanner = profileMod.deriveKycBannerState({
    ...baseProfile,
    compliance: {
      ...baseProfile.compliance,
      overallStatus: 'EXPIRING_SOON',
      canRenew: true,
      expiringSoonCount: 1,
      items: [
        {
          type: 'INSURANCE',
          status: 'EXPIRING_SOON',
          urgent: false,
          daysRemaining: 20,
          expiresAt: '2026-11-15T23:59:59.999Z',
          documentId: 'doc-1',
          hasPendingRenewal: false,
        },
      ],
    },
  });
  assert.equal(warningBanner.tone, 'warning');
  assert.equal(warningBanner.ctaLabel, 'Renew Early');

  // 4 days remaining -> urgent danger
  const urgentBanner = profileMod.deriveKycBannerState({
    ...baseProfile,
    compliance: {
      ...baseProfile.compliance,
      overallStatus: 'EXPIRING_SOON',
      canRenew: true,
      expiringSoonCount: 1,
      items: [
        {
          type: 'DRIVING_LICENSE',
          status: 'EXPIRING_SOON',
          urgent: true,
          daysRemaining: 4,
          expiresAt: '2026-10-30T23:59:59.999Z',
          documentId: 'doc-2',
          hasPendingRenewal: false,
        },
      ],
    },
  });
  assert.equal(urgentBanner.tone, 'danger');
  assert.ok(urgentBanner.title.includes('4 Days'));

  // Expired -> danger + Renew Documents
  const expiredBanner = profileMod.deriveKycBannerState({
    ...baseProfile,
    driver: { id: 'd1', status: 'ACTIVE', kycStatus: 'EXPIRED' },
    compliance: {
      ...baseProfile.compliance,
      overallStatus: 'EXPIRED',
      canRenew: true,
      expiredCount: 1,
      items: [
        {
          type: 'PERMIT',
          status: 'EXPIRED',
          urgent: true,
          daysRemaining: -2,
          expiresAt: '2026-10-24T23:59:59.999Z',
          documentId: 'doc-3',
          hasPendingRenewal: false,
        },
      ],
    },
  });
  assert.equal(expiredBanner.tone, 'danger');
  assert.equal(expiredBanner.ctaLabel, 'Renew Documents');

  // Early renewal submitted while prior docs remain valid -> info
  const reviewBanner = profileMod.deriveKycBannerState({
    ...baseProfile,
    application: { id: 'a2', status: 'REAPPLIED', rejectionType: null, rejectionReason: null },
    compliance: {
      ...baseProfile.compliance,
      overallStatus: 'EXPIRING_SOON',
      hasPendingRenewal: true,
    },
  });
  assert.equal(reviewBanner.tone, 'info');
  assert.ok(reviewBanner.message.includes('continue driving'));

  // Fixable rejection on renewal -> warning with admin reason
  const rejectedBanner = profileMod.deriveKycBannerState({
    ...baseProfile,
    application: {
      id: 'a2',
      status: 'REJECTED',
      rejectionType: 'FIXABLE',
      rejectionReason: 'Uploaded insurance policy is blurry',
    },
  });
  assert.equal(rejectedBanner.tone, 'warning');
  assert.ok(rejectedBanner.message.includes('blurry'));
});

test('pickDriverLicense accepts PDF, JPEG, and PNG within 500 KB and rejects unsupported or oversize files', async () => {
  let nextPickerResult = null;
  const licenseMod = loadTsModule('../../services/driver-license.ts', {
    'expo-document-picker': {
      getDocumentAsync: async () => nextPickerResult,
    },
    'expo-file-system': {
      File: class {},
    },
    'react-native': {
      Platform: { OS: 'web' },
    },
  });

  nextPickerResult = {
    canceled: false,
    assets: [{ name: 'permit.png', size: 128, base64: 'iVBORw0KGgoAAAANSUhEUg==' }],
  };
  const pickedPng = await licenseMod.pickDriverLicense('Permit');
  assert.equal(pickedPng.name, 'permit.png');
  assert.ok(pickedPng.dataUrl.startsWith('data:image/png;base64,'));

  nextPickerResult = {
    canceled: false,
    assets: [{ name: 'permit.webp', size: 128, base64: 'UklGRg==' }],
  };
  await assert.rejects(() => licenseMod.pickDriverLicense('Permit'), /PDF, JPG, JPEG, or PNG/i);

  nextPickerResult = {
    canceled: false,
    assets: [{ name: 'huge.png', size: 550 * 1024, base64: 'iVBORw0KGgoAAAANSUhEUg==' }],
  };
  await assert.rejects(() => licenseMod.pickDriverLicense('Permit'), /500 KB or smaller/i);
});
