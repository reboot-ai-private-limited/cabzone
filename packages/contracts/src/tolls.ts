/** Informational actuals only; never part of negotiated fare or commission. */
export interface TollInfoDto {
  exists: boolean | null;
  estimatedAmountPaise: number | null;
  currency: 'INR';
}

export interface TollSnapshot extends TollInfoDto {
  provider: string;
  isEstimate: true;
  commercialVehicleCaveat: true;
  permitsMayApply: boolean;
}

export function tollDisclosure(
  snapshot: TollSnapshot | null | undefined,
  extended = false,
): string {
  if (extended)
    return `Original quote: ${tollDisclosure(snapshot)} Additional tolls or permits on the extension are payable at actuals.`;
  if (!snapshot) return 'Toll / permit estimate not captured; payable at actuals where applicable.';
  const permit = snapshot.permitsMayApply ? ' Interstate permits may apply at actuals.' : '';
  if (snapshot.exists === false) return `No highway tolls reported.${permit}`;
  if (snapshot.estimatedAmountPaise === null)
    return `Toll / permit applicable — amount unavailable (payable at actuals).${permit}`;
  return `Estimated toll ₹${(snapshot.estimatedAmountPaise / 100).toFixed(2)}, separate from fare. Commercial vehicle charges may differ; payable at actuals.${permit}`;
}
