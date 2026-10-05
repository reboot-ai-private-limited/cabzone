import type { GeoPoint } from '@cabzone/geo';
import type { ResolvedLocationDetails } from '@cabzone/contracts';
import type { DestinationStateResolverPort } from '../domain/stateResolver.port.js';

export class ResolveDestinationStateUseCase {
  constructor(private readonly resolver: DestinationStateResolverPort) {}

  async execute(point: GeoPoint): Promise<string | null> {
    return this.resolver.resolve(point);
  }

  async resolveLocation(point: GeoPoint): Promise<ResolvedLocationDetails> {
    return this.resolver.resolveLocation(point);
  }
}
