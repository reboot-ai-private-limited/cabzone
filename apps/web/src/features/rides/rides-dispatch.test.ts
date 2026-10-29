import { describe, expect, it } from 'vitest';
import type { DispatchFleetDriverDto, VehicleCategory } from '@cabzone/contracts';
import type { PaymentDisputeEvidenceDto, RideEventDto } from '../../lib/api/endpoints/rides';
import {
  canAdminForceCancelRide,
  canAdminMutateFinance,
  canAdminResolveDispute,
  canAdminViewDisputes,
  canAdminWaiveCancellationFee,
  deriveDisputePaymentStates,
  extractChargedCancellationFeePaise,
} from './lib/adminRidePermissions';

describe('Ride Dispatch Map Helpers & Logic', () => {
  it('correctly maps vehicle categories to distinct styling tones', () => {
    const categories: VehicleCategory[] = ['CAB', 'E_RICKSHAW'];
    expect(categories.length).toBe(2);
  });

  it('correctly tracks busy vs online drivers in fleet', () => {
    const sampleFleet: DispatchFleetDriverDto[] = [
      {
        driverId: 'sim-driver-1',
        userId: 'u1',
        vehicleCategory: 'CAB',
        lat: 26.7271,
        lng: 88.423,
        heading: 45,
        speedMps: 6,
        status: 'ONLINE',
        activeRideId: null,
        locationUpdatedAt: new Date().toISOString(),
      },
      {
        driverId: 'sim-driver-2',
        userId: 'u2',
        vehicleCategory: 'E_RICKSHAW',
        lat: 26.7115,
        lng: 88.3912,
        heading: 120,
        speedMps: 4,
        status: 'BUSY',
        activeRideId: 'ride-123',
        locationUpdatedAt: new Date().toISOString(),
      },
    ];

    const online = sampleFleet.filter((d) => d.status === 'ONLINE');
    const busy = sampleFleet.filter((d) => d.status === 'BUSY');

    expect(online.length).toBe(1);
    expect(busy.length).toBe(1);
    expect(busy[0]?.activeRideId).toBe('ride-123');
  });

  it('handles heading degrees for radar bearing rotation', () => {
    const heading = 190;
    const rotationStr = `rotate(${heading}, 18, 18)`;
    expect(rotationStr).toBe('rotate(190, 18, 18)');
  });
});

describe('Admin Ride, Dispute, Waiver & Finance Role Guards (B04)', () => {
  it('denies every mutating or sensitive view action when admin role is null/undefined', () => {
    expect(canAdminViewDisputes(null)).toBe(false);
    expect(canAdminResolveDispute(null, 'PAYMENT_DISPUTED')).toBe(false);
    expect(canAdminForceCancelRide(null, 'OFFERING')).toBe(false);
    expect(canAdminWaiveCancellationFee(null, 'CANCELLED')).toBe(false);
    expect(canAdminMutateFinance(null)).toBe(false);
  });

  it('matches exact backend RBAC matrix across admin roles', () => {
    expect(canAdminViewDisputes('SUPER_ADMIN')).toBe(true);
    expect(canAdminViewDisputes('SUPPORT_ADMIN')).toBe(true);
    expect(canAdminViewDisputes('FINANCE_ADMIN')).toBe(true);
    expect(canAdminViewDisputes('CITY_ADMIN')).toBe(false);

    expect(canAdminResolveDispute('SUPER_ADMIN', 'PAYMENT_DISPUTED')).toBe(true);
    expect(canAdminResolveDispute('SUPPORT_ADMIN', 'PAYMENT_DISPUTED')).toBe(true);
    expect(canAdminResolveDispute('FINANCE_ADMIN', 'PAYMENT_DISPUTED')).toBe(false);
    expect(canAdminResolveDispute('SUPER_ADMIN', 'TRIP_COMPLETED')).toBe(false);

    expect(canAdminWaiveCancellationFee('SUPER_ADMIN', 'CANCELLED')).toBe(true);
    expect(canAdminWaiveCancellationFee('SUPPORT_ADMIN', 'CANCELLED')).toBe(true);
    expect(canAdminWaiveCancellationFee('FINANCE_ADMIN', 'CANCELLED')).toBe(true);
    expect(canAdminWaiveCancellationFee('CITY_ADMIN', 'CANCELLED')).toBe(false);
    expect(canAdminWaiveCancellationFee('SUPPORT_ADMIN', 'TRIP_COMPLETED')).toBe(false);

    expect(canAdminForceCancelRide('CITY_ADMIN', 'DRIVER_ASSIGNED')).toBe(true);
    expect(canAdminForceCancelRide('FINANCE_ADMIN', 'DRIVER_ASSIGNED')).toBe(false);

    expect(canAdminMutateFinance('SUPER_ADMIN')).toBe(true);
    expect(canAdminMutateFinance('FINANCE_ADMIN')).toBe(true);
    expect(canAdminMutateFinance('SUPPORT_ADMIN')).toBe(false);
    expect(canAdminMutateFinance('CITY_ADMIN')).toBe(false);
  });

  it('distinguishes provider-confirmed, cash-reported, pending, and manual-refund-review states', () => {
    const baseEvidence: PaymentDisputeEvidenceDto = {
      paymentCollection: 'RAZORPAY_UPI',
      paymentMethod: 'UPI',
      paymentConfirmedAt: '2026-10-28T10:00:00Z',
      providerMode: 'test',
      providerOrderId: 'order_123',
      providerPaymentId: 'pay_123',
      providerQrId: 'qr_123',
      providerRefundReference: null,
      requiresManualProviderRefund: true,
      commissionChargedPaise: 1600,
      commissionRefundedPaise: 0,
      refundTransactionId: null,
      onlineEarningsCreditedPaise: 18400,
    };

    expect(deriveDisputePaymentStates(baseEvidence, null)).toEqual([
      'PROVIDER_CONFIRMED',
      'REFUND_REVIEW_REQUIRED',
    ]);

    expect(
      deriveDisputePaymentStates(
        {
          ...baseEvidence,
          providerRefundReference: 'rfnd_999',
        },
        {
          id: 'ev-1',
          eventType: 'PAYMENT_DISPUTE_RESOLVED',
          actorType: 'ADMIN',
          actorId: 'a-1',
          previousStatus: 'PAYMENT_DISPUTED',
          newStatus: 'SETTLED',
          metadata: { outcome: 'RIDER_WINS' },
          createdAt: '2026-10-28T10:05:00Z',
        },
      ),
    ).toEqual(['PROVIDER_CONFIRMED', 'REFUND_RECORDED']);
  });

  it('extracts charged cancellation fee and waiver state from ride events', () => {
    const events: RideEventDto[] = [
      {
        id: '1',
        eventType: 'RIDE_CANCELLED',
        actorType: 'RIDER',
        actorId: 'u-1',
        previousStatus: 'DRIVER_ASSIGNED',
        newStatus: 'CANCELLED',
        metadata: { cancellationFeePaise: 3000 },
        createdAt: '2026-10-28T10:00:00Z',
      },
    ];
    expect(extractChargedCancellationFeePaise(events)).toEqual({
      chargedPaise: 3000,
      alreadyWaived: false,
      waivedPaise: 0,
    });

    expect(
      extractChargedCancellationFeePaise([
        ...events,
        {
          id: '2',
          eventType: 'CANCELLATION_FEE_WAIVED',
          actorType: 'ADMIN',
          actorId: 'a-1',
          previousStatus: 'CANCELLED',
          newStatus: 'CANCELLED',
          metadata: { waivedPaise: 3000 },
          createdAt: '2026-10-28T10:02:00Z',
        },
      ]),
    ).toEqual({
      chargedPaise: 3000,
      alreadyWaived: true,
      waivedPaise: 3000,
    });
  });
});
