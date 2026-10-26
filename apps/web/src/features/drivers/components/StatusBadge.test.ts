import { describe, expect, it } from 'vitest';
import {
  computeDocumentExpiryBadge,
  isReviewable,
  REVIEWABLE,
} from './StatusBadge';
import {
  hasDocumentPreviewFile,
  isPdfPreview,
  resolvePreviewContentUrl,
  resolveSafeProfilePhotoUrl,
} from '../../../lib/api/endpoints/drivers';

describe('Driver StatusBadge & KYC compliance helpers', () => {
  it('correctly marks submitted applications as reviewable', () => {
    expect(isReviewable('SUBMITTED')).toBe(true);
    expect(isReviewable('UNDER_REVIEW_AUTO')).toBe(true);
    expect(isReviewable('UNDER_REVIEW_ADMIN')).toBe(true);
    expect(isReviewable('REAPPLIED')).toBe(true);
  });

  it('correctly marks finalized applications as non-reviewable', () => {
    expect(isReviewable('APPROVED')).toBe(false);
    expect(isReviewable('REJECTED')).toBe(false);
    expect(isReviewable('DRAFT')).toBe(false);
  });

  it('REVIEWABLE set has exact size of active review states', () => {
    expect(REVIEWABLE.size).toBe(4);
    expect(Array.from(REVIEWABLE)).toEqual(
      expect.arrayContaining(['SUBMITTED', 'UNDER_REVIEW_AUTO', 'UNDER_REVIEW_ADMIN', 'REAPPLIED']),
    );
  });

  it('computes 30-day warning, 7-day urgent, and expired document badges', () => {
    const now = Date.parse('2026-10-26T12:00:00.000Z');

    expect(
      computeDocumentExpiryBadge('2027-01-15T23:59:59.999Z', 'VERIFIED', now),
    ).toBeNull();

    expect(
      computeDocumentExpiryBadge('2026-11-15T12:00:00.000Z', 'VERIFIED', now),
    ).toEqual({
      label: 'Expiring (20d)',
      tone: 'warning',
      daysRemaining: 20,
    });

    expect(
      computeDocumentExpiryBadge('2026-10-31T12:00:00.000Z', 'VERIFIED', now),
    ).toEqual({
      label: 'Expires in 5d',
      tone: 'danger',
      daysRemaining: 5,
    });

    expect(
      computeDocumentExpiryBadge('2026-10-25T12:00:00.000Z', 'VERIFIED', now),
    ).toEqual({
      label: 'Expired',
      tone: 'danger',
      daysRemaining: -1,
    });

    expect(computeDocumentExpiryBadge(null, 'EXPIRED', now)).toEqual({
      label: 'Expired',
      tone: 'danger',
      daysRemaining: 0,
    });
  });

  it('recognizes private KYC vault storage keys and blocks raw http/data pass-through', () => {
    expect(
      hasDocumentPreviewFile({ storageKey: 'driver-kyc/01900000-0000-7000-8000-000000000001.pdf' }),
    ).toBe(true);
    expect(
      hasDocumentPreviewFile({ storageKey: 'driver-kyc/01900000-0000-7000-8000-000000000002.png' }),
    ).toBe(true);
    expect(
      hasDocumentPreviewFile({ storageKey: 'driver-kyc/01900000-0000-7000-8000-000000000003.jpg' }),
    ).toBe(true);

    // Raw URLs, data URIs, and seed keys must never be treated as vault files unless server confirms hasFile
    expect(
      hasDocumentPreviewFile({ storageKey: 'https://evil.example/leak.jpg' }),
    ).toBe(false);
    expect(
      hasDocumentPreviewFile({ storageKey: 'data:image/png;base64,iVBORw0KGgo=' }),
    ).toBe(false);
    expect(
      hasDocumentPreviewFile({ storageKey: 'seed-dl-key', hasFile: false }),
    ).toBe(false);
  });

  it('resolves signed preview content URLs safely against API origin without /api/api duplication', () => {
    expect(
      resolvePreviewContentUrl(
        '/api/v1/admin/driver-documents/doc-123/content?exp=1793000000&sig=abcdef1234',
        'http://localhost:4000/api',
      ),
    ).toBe(
      'http://localhost:4000/api/v1/admin/driver-documents/doc-123/content?exp=1793000000&sig=abcdef1234',
    );

    expect(
      resolvePreviewContentUrl(
        '/api/v1/admin/driver-documents/doc-123/content?exp=1793000000&sig=abcdef1234',
        'https://staging.cabzone.in/gw/api',
      ),
    ).toBe(
      'https://staging.cabzone.in/gw/api/v1/admin/driver-documents/doc-123/content?exp=1793000000&sig=abcdef1234',
    );

    // Reject data:, javascript:, cross-origin, or unsigned URLs
    expect(
      resolvePreviewContentUrl('data:application/pdf;base64,JVBERi0xLjQK', 'http://localhost:4000/api'),
    ).toBeNull();
    expect(
      resolvePreviewContentUrl(
        'https://evil.example/api/v1/admin/driver-documents/doc-123/content?exp=1&sig=2',
        'http://localhost:4000/api',
      ),
    ).toBeNull();
    expect(
      resolvePreviewContentUrl(
        '/api/v1/admin/driver-documents/doc-123/content',
        'http://localhost:4000/api',
      ),
    ).toBeNull();
  });

  it('detects PDF vs image previews and validates profile photo URLs', () => {
    expect(isPdfPreview('application/pdf', 'driver-kyc/doc.pdf')).toBe(true);
    expect(isPdfPreview('image/png', 'driver-kyc/doc.png')).toBe(false);
    expect(isPdfPreview('image/jpeg', 'driver-kyc/doc.jpg')).toBe(false);
    expect(isPdfPreview(null, 'driver-kyc/doc.pdf')).toBe(true);

    expect(resolveSafeProfilePhotoUrl('https://res.cloudinary.com/demo/image/upload/p.jpg')).toBe(
      'https://res.cloudinary.com/demo/image/upload/p.jpg',
    );
    expect(resolveSafeProfilePhotoUrl('javascript:alert(1)')).toBeNull();
    expect(resolveSafeProfilePhotoUrl('data:image/jpeg;base64,/9j/4AAQ')).toBeNull();
  });
});
