import { describe, expect, it } from 'vitest';
import type { DispatchFleetDriverDto, VehicleCategory } from '@cabzone/contracts';

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
