import { describe, expect, it } from 'vitest';
import { collectableArrearsPaise } from '../src/modules/rides/application/collectableArrears.js';
import type { WalletEntity } from '../src/modules/ledger/ledger.public.js';

const wallet = (balancePaise: number): WalletEntity => ({ balancePaise }) as WalletEntity;

describe('collectableArrearsPaise', () => {
  it('charges what the ride carries when the rider still owes it', () => {
    expect(collectableArrearsPaise({ arrearsPaise: 5000 }, wallet(-5000))).toBe(5000);
  });
  it('charges nothing once the fee was waived or paid', () => {
    expect(collectableArrearsPaise({ arrearsPaise: 5000 }, wallet(0))).toBe(0);
  });
  it('never charges more than the rider owes now', () => {
    expect(collectableArrearsPaise({ arrearsPaise: 5000 }, wallet(-2000))).toBe(2000);
  });
  it('keeps the ride figure when the rider has no wallet', () => {
    expect(collectableArrearsPaise({ arrearsPaise: 5000 }, null)).toBe(5000);
    expect(collectableArrearsPaise({}, wallet(-100))).toBe(0);
  });
});
