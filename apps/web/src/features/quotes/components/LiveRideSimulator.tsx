'use client';

import { useEffect, useState } from 'react';
import type { QuoteDto } from '@cabzone/contracts';
import { Badge, Button, Input } from '@cabzone/design-system';
import {
  AlertCircle,
  Car,
  CheckCircle2,
  Clock,
  Key,
  Play,
  RefreshCw,
  ShieldCheck,
  User,
  Wallet,
  XCircle,
} from 'lucide-react';
import { getStoredToken } from '@/features/auth/lib/authApi.js';
import { ApiError } from '@/lib/api/ApiError.js';
import {
  ensureSimRiderToken,
  ridesApi,
  type AdminRideDto,
  type CompleteRideResultDto,
} from '@/lib/api/endpoints/rides.js';
import { formatPaise } from '@/lib/format.js';

export interface LiveRideSimulatorProps {
  quote: QuoteDto;
}

const SEEDED_DRIVER_ID = '01900000-0000-7000-8000-000000000020';
const DEFAULT_PASSENGER_NAME = 'Priya Mukherjee (Test Rider)';
const DEFAULT_PASSENGER_PHONE = '+919000000003';

export function LiveRideSimulator({ quote }: LiveRideSimulatorProps) {
  // Negotiation state
  const [proposedFarePaise, setProposedFarePaise] = useState<number>(quote.suggestedFarePaise);
  const [passengerName, setPassengerName] = useState(DEFAULT_PASSENGER_NAME);
  const [passengerPhone, setPassengerPhone] = useState(DEFAULT_PASSENGER_PHONE);
  const [showPassengerEdit, setShowPassengerEdit] = useState(false);

  // Active ride state
  const [activeRide, setActiveRide] = useState<(AdminRideDto & { pickupOtp?: string }) | null>(null);
  const [settlement, setSettlement] = useState<CompleteRideResultDto | null>(null);
  const [otpInput, setOtpInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Expiry countdown for OFFERING status
  const [secondsRemaining, setSecondsRemaining] = useState<number>(90);

  // Re-sync proposed fare when quote changes
  useEffect(() => {
    setProposedFarePaise(quote.suggestedFarePaise);
    setActiveRide(null);
    setSettlement(null);
    setErrorMsg(null);
  }, [quote.quoteId, quote.suggestedFarePaise]);

  // Offer expiry countdown timer
  useEffect(() => {
    if (activeRide?.status !== 'OFFERING') return;

    setSecondsRemaining(90);
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [activeRide?.id, activeRide?.status]);

  // Poll ride status as Rider so Driver App actions & 4-digit pickupOtp appear automatically
  useEffect(() => {
    if (!activeRide?.id || activeRide.status === 'SETTLED' || activeRide.status === 'CANCELLED') {
      return;
    }
    const interval = setInterval(async () => {
      try {
        const riderToken = await ensureSimRiderToken(
          passengerPhone.trim() || DEFAULT_PASSENGER_PHONE,
        );
        const fresh = await ridesApi.get(activeRide.id, riderToken);
        setActiveRide((prev) => ({
          ...fresh,
          pickupOtp: fresh.pickupOtp ?? prev?.pickupOtp,
        }));
      } catch {
        // ignore transient poll error
      }
    }, 2500);
    return () => clearInterval(interval);
  }, [activeRide?.id, activeRide?.status, passengerPhone]);

  const token = getStoredToken() ?? undefined;

  const handleCreateRide = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const targetPhone = passengerPhone.trim() || DEFAULT_PASSENGER_PHONE;
      const riderToken = await ensureSimRiderToken(targetPhone);
      const created = await ridesApi.create(
        {
          quoteToken: quote.quoteToken,
          proposedFarePaise,
          passenger: {
            name: passengerName.trim() || DEFAULT_PASSENGER_NAME,
            phoneE164: targetPhone,
          },
          vehicleCategory: quote.vehicleCategory,
          pickup: quote.pickup,
          drop: quote.drop,
        },
        riderToken,
      );
      setActiveRide(created);
      setSettlement(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(`${err.code}: ${err.message}`);
      } else if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to create ride from quote.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptRide = async () => {
    if (!activeRide) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const updated = await ridesApi.accept(activeRide.id, SEEDED_DRIVER_ID, token);
      setActiveRide(updated);
      if (updated.pickupOtp) {
        setOtpInput(updated.pickupOtp);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Driver acceptance failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleEnRoute = async () => {
    if (!activeRide) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const updated = await ridesApi.enRoute(activeRide.id, SEEDED_DRIVER_ID, token);
      setActiveRide((prev) => (prev ? { ...prev, ...updated, pickupOtp: prev.pickupOtp } : updated));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Driver en-route update failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleArrived = async () => {
    if (!activeRide) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const updated = await ridesApi.arrived(activeRide.id, SEEDED_DRIVER_ID, token);
      setActiveRide((prev) => (prev ? { ...prev, ...updated, pickupOtp: prev.pickupOtp } : updated));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Driver arrived update failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleStartTrip = async () => {
    if (!activeRide) return;
    const otpToUse = otpInput.trim() || activeRide.pickupOtp;
    if (!otpToUse) {
      setErrorMsg('4-digit OTP is required to start trip.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const updated = await ridesApi.start(activeRide.id, otpToUse, SEEDED_DRIVER_ID, token);
      setActiveRide((prev) => (prev ? { ...prev, ...updated, pickupOtp: prev.pickupOtp } : updated));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Starting trip failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteTrip = async () => {
    if (!activeRide) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const result = await ridesApi.complete(activeRide.id, SEEDED_DRIVER_ID, token);
      setActiveRide(result.ride);
      setSettlement(result);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Trip completion failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelRide = async () => {
    if (!activeRide) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const riderToken = await ensureSimRiderToken(
        passengerPhone.trim() || DEFAULT_PASSENGER_PHONE,
      );
      const result = await ridesApi.cancel(activeRide.id, 'RIDER_CHANGED_MIND', riderToken);
      setActiveRide(result.ride);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ride cancellation failed.');
    } finally {
      setLoading(false);
    }
  };

  const diffPercent = Math.round(
    ((proposedFarePaise - quote.suggestedFarePaise) / quote.suggestedFarePaise) * 100,
  );

  return (
    <div className="flex flex-col gap-3.5 p-3.5 bg-surface-muted/40 rounded-lg border border-border mt-1">
      {/* 1. Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Car className="size-4 text-interactive" />
          <h4 className="text-xs font-semibold text-text uppercase tracking-wider">
            Live Dispatch & Ride Simulation
          </h4>
        </div>
        {activeRide && (
          <Badge
            tone={
              activeRide.status === 'SETTLED'
                ? 'success'
                : activeRide.status === 'CANCELLED'
                  ? 'danger'
                  : 'accent'
            }
            className="text-[11px] font-semibold font-mono"
          >
            {activeRide.status}
          </Badge>
        )}
      </div>

      {/* 2. Error Display */}
      {errorMsg && (
        <div className="flex items-start gap-2 p-2.5 bg-danger/10 border border-danger/30 rounded-md text-xs text-danger">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <div className="break-words font-mono">{errorMsg}</div>
        </div>
      )}

      {/* 3. Pre-Creation View: Counter-Offer Negotiation & Ride Creation */}
      {!activeRide && (
        <div className="flex flex-col gap-3">
          {/* Fare Slider & Counter-Offer */}
          <div className="flex flex-col gap-1.5 p-3 bg-surface rounded-md border border-border/70">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-text">Proposed Counter-Offer:</span>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-bold text-text">
                  {formatPaise(proposedFarePaise)}
                </span>
                <Badge
                  tone={diffPercent > 0 ? 'accent' : diffPercent < 0 ? 'warning' : 'neutral'}
                  className="text-[10px] font-semibold"
                >
                  {diffPercent === 0 ? 'Suggested Base' : `${diffPercent > 0 ? '+' : ''}${diffPercent}%`}
                </Badge>
              </div>
            </div>

            {/* Slider */}
            <input
              type="range"
              min={quote.negotiation.floorPaise}
              max={quote.negotiation.ceilingPaise}
              step={100}
              value={proposedFarePaise}
              onChange={(e) => setProposedFarePaise(Number(e.target.value))}
              className="w-full accent-interactive cursor-pointer h-1.5 bg-surface-sunken rounded-lg mt-1"
            />

            {/* Quick Presets */}
            <div className="flex items-center justify-between text-[11px] pt-1 text-text-subtle">
              <button
                type="button"
                onClick={() => setProposedFarePaise(quote.negotiation.floorPaise)}
                className="hover:text-interactive font-medium underline-offset-2 hover:underline"
              >
                Floor: {formatPaise(quote.negotiation.floorPaise)}
              </button>
              <button
                type="button"
                onClick={() => setProposedFarePaise(quote.suggestedFarePaise)}
                className="hover:text-interactive font-medium underline-offset-2 hover:underline"
              >
                Reset ({formatPaise(quote.suggestedFarePaise)})
              </button>
              <button
                type="button"
                onClick={() => setProposedFarePaise(quote.negotiation.ceilingPaise)}
                className="hover:text-interactive font-medium underline-offset-2 hover:underline"
              >
                Ceiling: {formatPaise(quote.negotiation.ceilingPaise)}
              </button>
            </div>
          </div>

          {/* Passenger Details Toggle */}
          <div className="text-xs">
            <button
              type="button"
              onClick={() => setShowPassengerEdit(!showPassengerEdit)}
              className="flex items-center gap-1 text-[11px] text-text-subtle hover:text-text font-medium"
            >
              <User className="size-3" />
              <span>
                Passenger: <strong className="text-text">{passengerName}</strong> ({passengerPhone})
              </span>
              <span className="text-interactive underline ml-1">
                {showPassengerEdit ? 'Hide' : 'Edit'}
              </span>
            </button>

            {showPassengerEdit && (
              <div className="grid grid-cols-2 gap-2 mt-2 p-2 bg-surface rounded-md border border-border">
                <div>
                  <span className="text-[10px] text-text-subtle block mb-1">Name</span>
                  <Input
                    value={passengerName}
                    onChange={(e) => setPassengerName(e.target.value)}
                    className="h-7 text-xs"
                    placeholder="Passenger name"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-text-subtle block mb-1">Phone</span>
                  <Input
                    value={passengerPhone}
                    onChange={(e) => setPassengerPhone(e.target.value)}
                    className="h-7 text-xs"
                    placeholder="+91..."
                  />
                </div>
              </div>
            )}
          </div>

          {/* Create Ride Button */}
          <Button
            type="button"
            variant="primary"
            onClick={handleCreateRide}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2 font-semibold text-xs"
          >
            {loading ? (
              <RefreshCw className="size-3.5 animate-spin" />
            ) : (
              <Car className="size-3.5" />
            )}
            <span>Create Ride & Broadcast Offer</span>
          </Button>
        </div>
      )}

      {/* 4. Active Ride Simulation Flow */}
      {activeRide && (
        <div className="flex flex-col gap-3">
          {/* Ride Meta Header */}
          <div className="p-3 bg-surface rounded-md border border-border flex flex-col gap-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-text-subtle text-[11px]">Ride ID:</span>
              <span className="font-mono font-medium text-text select-all">
                {activeRide.id.slice(0, 16)}...
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-subtle text-[11px]">Agreed/Offered Fare:</span>
              <span className="font-bold text-text">
                {formatPaise(activeRide.proposedFarePaise ?? activeRide.suggestedFarePaise)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-subtle text-[11px]">Vehicle Category:</span>
              <Badge tone="neutral" className="text-[10px] font-semibold">
                {activeRide.vehicleCategory}
              </Badge>
            </div>
          </div>

          {/* State: OFFERING */}
          {activeRide.status === 'OFFERING' && (
            <div className="flex flex-col gap-2.5 p-3 bg-warning/10 border border-warning/30 rounded-md text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-warning font-semibold">
                  <span className="relative flex size-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75" />
                    <span className="relative inline-flex rounded-full size-2.5 bg-warning" />
                  </span>
                  <span>Waiting for Eligible Nearby Drivers</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-text-subtle font-mono">
                  <Clock className="size-3" />
                  <span>{secondsRemaining}s</span>
                </div>
              </div>
              <p className="text-[11px] text-text-subtle">
                A driver receives this offer only when online, eligible, within 5 km of pickup, and using the matching vehicle category. Check the dispatch log for the recipient count. You can also simulate acceptance below.
              </p>

              <Button
                type="button"
                variant="primary"
                onClick={handleAcceptRide}
                disabled={loading}
                className="w-full flex items-center justify-center gap-1.5 text-xs py-1.5 mt-1"
              >
                {loading ? <RefreshCw className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
                <span>Simulate Driver Accept (WB74A1234)</span>
              </Button>
            </div>
          )}

          {/* State: DRIVER_ASSIGNED, DRIVER_EN_ROUTE, DRIVER_ARRIVED */}
          {(activeRide.status === 'DRIVER_ASSIGNED' ||
            activeRide.status === 'DRIVER_EN_ROUTE' ||
            activeRide.status === 'DRIVER_ARRIVED') && (
            <div className="flex flex-col gap-3">
              {/* Driver Info Card */}
              <div className="p-2.5 bg-surface rounded-md border border-border flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="size-7 rounded-full bg-interactive/10 text-interactive flex items-center justify-center font-bold text-xs">
                    DR
                  </div>
                  <div>
                    <span className="font-semibold text-text block">Deepak Roy</span>
                    <span className="text-[10px] text-text-subtle font-mono">
                      Maruti Suzuki Dzire (WB74A1234) • 4.8★
                    </span>
                  </div>
                </div>
                <Badge tone="success" className="text-[10px]">
                  Assigned
                </Badge>
              </div>

              {/* Prominent Rider Pickup OTP */}
              {activeRide.pickupOtp && (
                <div className="p-3 bg-interactive/5 border border-interactive/30 rounded-md flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-interactive block flex items-center gap-1">
                      <Key className="size-3" />
                      <span>Rider Pickup OTP</span>
                    </span>
                    <span className="text-xl font-mono font-bold tracking-widest text-text">
                      {activeRide.pickupOtp}
                    </span>
                  </div>
                  <span className="text-[10px] text-text-subtle max-w-[130px] text-right">
                    Share with driver at pickup to start trip
                  </span>
                </div>
              )}

              {/* Lifecycle Step Actions */}
              <div className="flex flex-col gap-2">
                {activeRide.status === 'DRIVER_ASSIGNED' && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleEnRoute}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-1.5 text-xs py-1.5"
                  >
                    {loading ? <RefreshCw className="size-3 animate-spin" /> : <Car className="size-3" />}
                    <span>Driver Goes En Route</span>
                  </Button>
                )}

                {activeRide.status === 'DRIVER_EN_ROUTE' && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleArrived}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-1.5 text-xs py-1.5"
                  >
                    {loading ? <RefreshCw className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
                    <span>Driver Arrives at Pickup</span>
                  </Button>
                )}

                {activeRide.status === 'DRIVER_ARRIVED' && (
                  <div className="flex flex-col gap-2 p-2.5 bg-surface rounded-md border border-border">
                    <div className="flex items-center gap-2">
                      <Input
                        value={otpInput}
                        onChange={(e) => setOtpInput(e.target.value)}
                        placeholder="Enter 4-digit OTP"
                        maxLength={4}
                        className="h-8 font-mono text-center tracking-widest text-sm"
                      />
                      <Button
                        type="button"
                        variant="primary"
                        onClick={handleStartTrip}
                        disabled={loading || otpInput.length !== 4}
                        className="shrink-0 h-8 text-xs font-semibold px-3"
                      >
                        {loading ? <RefreshCw className="size-3 animate-spin" /> : <Play className="size-3" />}
                        <span>Verify & Start</span>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* State: TRIP_STARTED */}
          {activeRide.status === 'TRIP_STARTED' && (
            <div className="flex flex-col gap-2.5 p-3 bg-success/10 border border-success/30 rounded-md text-xs">
              <div className="flex items-center gap-2 text-success font-semibold">
                <span className="relative flex size-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex rounded-full size-2.5 bg-success" />
                </span>
                <span>Trip In Progress (Passenger on Board)</span>
              </div>
              <p className="text-[11px] text-text-subtle">
                OTP verified successfully. Driver is navigating along the computed route. Click below to complete trip and trigger driver wallet commission deduction in MongoDB.
              </p>
              <Button
                type="button"
                variant="primary"
                onClick={handleCompleteTrip}
                disabled={loading}
                className="w-full flex items-center justify-center gap-1.5 text-xs py-1.5 mt-1"
              >
                {loading ? <RefreshCw className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                <span>Complete Trip & Settle Commission</span>
              </Button>
            </div>
          )}

          {/* State: SETTLED */}
          {activeRide.status === 'SETTLED' && settlement && (
            <div className="flex flex-col gap-2.5 p-3.5 bg-surface rounded-md border border-success/40 text-xs">
              <div className="flex items-center gap-2 text-success font-semibold pb-1 border-b border-border">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>Trip Completed & Wallet Commission Settled</span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                <div className="p-2 bg-surface-sunken rounded border border-border/60">
                  <span className="text-[10px] text-text-subtle block font-medium">Final Fare</span>
                  <span className="font-bold text-text text-sm">
                    {formatPaise(settlement.farePaise)}
                  </span>
                </div>
                <div className="p-2 bg-surface-sunken rounded border border-border/60">
                  <span className="text-[10px] text-text-subtle block font-medium">Platform Commission</span>
                  <span className="font-bold text-danger text-sm">
                    -{formatPaise(settlement.commissionPaise)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between p-2 bg-success/5 rounded border border-success/20 mt-1">
                <div className="flex items-center gap-1.5 text-text">
                  <Wallet className="size-3.5 text-success" />
                  <span className="text-[11px] font-medium">Driver Wallet Balance:</span>
                </div>
                <span className="font-bold font-mono text-success text-xs">
                  {formatPaise(settlement.walletBalancePaise)}
                </span>
              </div>

              <div className="text-[10px] text-text-subtle font-mono pt-1 text-center">
                ✓ Double-entry ledger transaction saved in MongoDB
              </div>
            </div>
          )}

          {/* Cancel & Reset Actions */}
          <div className="flex items-center justify-between pt-1 border-t border-border text-xs">
            {activeRide.status !== 'SETTLED' && activeRide.status !== 'CANCELLED' && (
              <button
                type="button"
                onClick={handleCancelRide}
                disabled={loading}
                className="flex items-center gap-1 text-[11px] text-danger hover:underline font-medium"
              >
                <XCircle className="size-3" />
                <span>Cancel Trip</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setActiveRide(null);
                setSettlement(null);
                setErrorMsg(null);
              }}
              className="flex items-center gap-1 text-[11px] text-interactive hover:underline font-medium ml-auto"
            >
              <RefreshCw className="size-3" />
              <span>Reset Simulator</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
