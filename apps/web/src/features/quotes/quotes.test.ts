import { describe, expect, it, vi } from 'vitest';
import { quotesApi, validateCoordinates } from '../../lib/api/endpoints/quotes';
import * as client from '../../lib/api/client';

describe('Trip Simulator — Quotes & Validation', () => {
  it('validates coordinates strictly within geographic limits', () => {
    expect(validateCoordinates({ lat: 26.7271, lng: 88.3953 })).toBe(true);
    expect(validateCoordinates({ lat: 0, lng: 0 })).toBe(true);
    expect(validateCoordinates({ lat: 90, lng: 180 })).toBe(true);
    expect(validateCoordinates({ lat: -90, lng: -180 })).toBe(true);

    // Invalid bounds
    expect(validateCoordinates({ lat: 90.0001, lng: 88.0 })).toBe(false);
    expect(validateCoordinates({ lat: -90.1, lng: 88.0 })).toBe(false);
    expect(validateCoordinates({ lat: 26.0, lng: 180.0001 })).toBe(false);
    expect(validateCoordinates({ lat: 26.0, lng: -180.0001 })).toBe(false);

    // Non-finite
    expect(validateCoordinates({ lat: NaN, lng: 88.0 })).toBe(false);
    expect(validateCoordinates({ lat: 26.0, lng: Infinity })).toBe(false);
  });

  it('rejects invalid pickup coordinates before network dispatch', () => {
    const invalidInput = {
      pickup: { lat: 95.0, lng: 88.0 },
      drop: { lat: 26.0, lng: 88.0 },
      vehicleCategory: 'CAB' as const,
    };

    expect(() => quotesApi.simulate(invalidInput)).toThrow(
      /Invalid pickup coordinates/i,
    );
  });

  it('rejects invalid drop coordinates before network dispatch', () => {
    const invalidInput = {
      pickup: { lat: 26.0, lng: 88.0 },
      drop: { lat: 26.0, lng: 200.0 },
      vehicleCategory: 'CAB' as const,
    };

    expect(() => quotesApi.simulate(invalidInput)).toThrow(
      /Invalid drop coordinates/i,
    );
  });

  it('rejects pickup or drop outside India before network dispatch', () => {
    // Kathmandu, Nepal (lat 27.7172, lng 85.3240)
    const outsidePickup = {
      pickup: { lat: 27.7172, lng: 85.324 },
      drop: { lat: 26.7271, lng: 88.3953 },
      vehicleCategory: 'CAB' as const,
    };
    expect(() => quotesApi.simulate(outsidePickup)).toThrow(/OUTSIDE_INDIA/);

    const outsideDrop = {
      pickup: { lat: 26.7271, lng: 88.3953 },
      drop: { lat: 27.7172, lng: 85.324 },
      vehicleCategory: 'CAB' as const,
    };
    expect(() => quotesApi.simulate(outsideDrop)).toThrow(/OUTSIDE_INDIA/);
  });

  it('delegates valid simulate request to POST /v1/pricing/quotes', async () => {
    const requestSpy = vi.spyOn(client, 'request').mockResolvedValueOnce({
      quoteId: 'test-quote-1',
      pickup: { lat: 26.7271, lng: 88.3953 },
      drop: { lat: 26.745, lng: 88.428 },
      distanceM: 4500,
      estimatedDurationSeconds: 600,
      serviceType: 'IN_CITY',
      cityZoneId: 'zone-1',
      cityName: 'Siliguri City',
      bufferApplied: false,
      vehicleCategory: 'CAB',
      suggestedFarePaise: 8500,
      pricingConfigId: 'cfg-1',
      pricingConfigVersion: 1,
      routeScope: null,
      destinationStateCode: null,
      negotiation: {
        floorPaise: 7000,
        ceilingPaise: 12000,
      },
      expiresAt: '2026-10-01T12:00:00.000Z',
      quoteToken: 'signed.token',
    });

    const input = {
      pickup: { lat: 26.7271, lng: 88.3953 },
      drop: { lat: 26.745, lng: 88.428 },
      vehicleCategory: 'CAB' as const,
    };

    const res = await quotesApi.simulate(input, 'test-token');
    expect(res.quoteId).toBe('test-quote-1');
    expect(res.serviceType).toBe('IN_CITY');
    expect(requestSpy).toHaveBeenCalledWith('/v1/pricing/quotes', {
      method: 'POST',
      body: input,
      token: 'test-token',
    });
  });

  it('delegates ride creation and full lifecycle dispatch actions correctly', async () => {
    const { ridesApi } = await import('../../lib/api/endpoints/rides.js');
    const requestSpy = vi.spyOn(client, 'request');

    // 1. Create Ride
    requestSpy.mockResolvedValueOnce({
      id: 'ride-123',
      status: 'OFFERING',
      proposedFarePaise: 8500,
    });

    const createPayload = {
      quoteToken: 'token-abc',
      proposedFarePaise: 8500,
      passenger: { name: 'Priya Mukherjee', phoneE164: '+919000000003' },
      vehicleCategory: 'CAB' as const,
      pickup: { lat: 26.71, lng: 88.42 },
      drop: { lat: 26.75, lng: 88.45 },
    };

    const created = await ridesApi.create(createPayload, 'admin-token');
    expect(created.id).toBe('ride-123');
    expect(created.status).toBe('OFFERING');
    expect(requestSpy).toHaveBeenLastCalledWith('/v1/rides', {
      method: 'POST',
      body: createPayload,
      token: 'admin-token',
    });

    // 2. Accept Ride
    requestSpy.mockResolvedValueOnce({
      id: 'ride-123',
      status: 'DRIVER_ASSIGNED',
      pickupOtp: '4821',
    });
    const accepted = await ridesApi.accept('ride-123', 'driver-001', 'admin-token');
    expect(accepted.status).toBe('DRIVER_ASSIGNED');
    expect(accepted.pickupOtp).toBe('4821');
    expect(requestSpy).toHaveBeenLastCalledWith('/v1/rides/ride-123/accept', {
      method: 'POST',
      body: { driverId: 'driver-001' },
      token: 'admin-token',
    });

    // 3. Start Ride
    requestSpy.mockResolvedValueOnce({
      id: 'ride-123',
      status: 'TRIP_STARTED',
    });
    const started = await ridesApi.start('ride-123', '4821', 'driver-001', 'admin-token');
    expect(started.status).toBe('TRIP_STARTED');
    expect(requestSpy).toHaveBeenLastCalledWith('/v1/rides/ride-123/start', {
      method: 'POST',
      body: { otp: '4821', driverId: 'driver-001' },
      token: 'admin-token',
    });

    // 4. Complete Ride
    requestSpy.mockResolvedValueOnce({
      ride: { id: 'ride-123', status: 'SETTLED' },
      farePaise: 8500,
      commissionPaise: 680,
      walletBalancePaise: 49320,
    });
    const completed = await ridesApi.complete('ride-123', 'driver-001', 'admin-token');
    expect(completed.ride.status).toBe('SETTLED');
    expect(completed.commissionPaise).toBe(680);
    expect(completed.walletBalancePaise).toBe(49320);
    expect(requestSpy).toHaveBeenLastCalledWith('/v1/rides/ride-123/complete', {
      method: 'POST',
      body: { driverId: 'driver-001' },
      token: 'admin-token',
    });
  });
});
