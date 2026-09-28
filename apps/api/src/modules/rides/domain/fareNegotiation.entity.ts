import type { NegotiationAction, NegotiationActor } from '@Cabzone/contracts';

export interface FareNegotiationEntity {
  id: string;
  rideId: string;
  actorType: NegotiationActor;
  actorId: string | null;
  previousFarePaise: number | null;
  proposedFarePaise: number;
  action: NegotiationAction;
  reasonCode: string | null;
  createdAt: Date;
}

export function isNegotiationWithinBounds(opts: {
  proposedFarePaise: number;
  floorPaise: number;
  ceilingPaise: number;
}): boolean {
  return (
    opts.proposedFarePaise >= opts.floorPaise &&
    opts.proposedFarePaise <= opts.ceilingPaise
  );
}
