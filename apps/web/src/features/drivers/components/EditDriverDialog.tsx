'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Car,
  CheckCircle2,
  FileText,
  Phone,
  Shield,
  User,
} from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  Input,
  Select,
} from '@cabzone/design-system';
import { VEHICLE_CATEGORIES, type VehicleCategory } from '@cabzone/contracts';
import type { DriverApplicationSummaryDto } from '@/lib/api/endpoints/drivers';
import { useUpdateDriverProfile, useUpdateDriverStatus } from '../hooks/useDriverApplications';
import { getDriverPhone } from './DriversScreen';

export interface EditDriverDialogProps {
  driverSummary: DriverApplicationSummaryDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const VEHICLE_TYPE_OPTIONS = VEHICLE_CATEGORIES.map((cat) => ({
  value: cat,
  label: cat.replace(/_/g, ' '),
}));

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active (Dispatch Eligible)' },
  { value: 'SUSPENDED', label: 'Suspended (Dispatch Blocked)' },
];

export function EditDriverDialog({
  driverSummary,
  open,
  onOpenChange,
  onSuccess,
}: EditDriverDialogProps) {
  const driver = driverSummary?.driver;
  const application = driverSummary?.application;
  const vehicle = driverSummary?.vehicle;

  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [address, setAddress] = useState('');
  const [dlNumber, setDlNumber] = useState('');
  const [dlExpiry, setDlExpiry] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'SUSPENDED'>('ACTIVE');
  const [vehicleType, setVehicleType] = useState<VehicleCategory>('CAB');
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  // Sync state whenever driverSummary changes or modal opens
  useEffect(() => {
    if (driverSummary) {
      setName(driver?.name ?? '');
      setPhone(getDriverPhone(driverSummary) ?? '');
      setAlternatePhone(
        driverSummary.alternatePhone ??
          (driver as any)?.alternatePhone ??
          ''
      );
      setEmergencyContact(
        driverSummary.emergencyContact ??
          (driver as any)?.emergencyContact ??
          ''
      );
      setAddress(driver?.address ?? '');
      setDlNumber(driver?.dlNumber ?? '');
      setDlExpiry(driver?.dlExpiry ? driver.dlExpiry.slice(0, 10) : '');
      setStatus(driver?.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE');
      setVehicleType(vehicle?.vehicleType ?? 'CAB');
      setVehicleMake(vehicle?.make ?? '');
      setVehicleModel(vehicle?.model ?? '');
      setRegistrationNumber(vehicle?.registrationNumber ?? '');
      setErrorMessage(null);
      setNoticeMessage(null);
    }
  }, [driverSummary, driver, vehicle, open]);

  const updateProfileMutation = useUpdateDriverProfile(() => {
    setErrorMessage(null);
    onOpenChange(false);
    onSuccess?.();
  });

  const updateStatusMutation = useUpdateDriverStatus(() => {
    setErrorMessage(null);
    onOpenChange(false);
    onSuccess?.();
  });

  if (!driverSummary || !application) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setNoticeMessage(null);

    const trimmedPhone = phone.trim();
    // Validate phone formatting if entered
    if (trimmedPhone && !/^\+[1-9]\d{7,14}$/.test(trimmedPhone)) {
      setErrorMessage(
        'Phone number must be in international format starting with + (e.g. +919876543210).'
      );
      return;
    }

    try {
      await updateProfileMutation.mutateAsync({
        id: application.id,
        body: {
          name: name.trim() || null,
          phoneE164: trimmedPhone || null,
          alternatePhone: alternatePhone.trim() || null,
          emergencyContact: emergencyContact.trim() || null,
          address: address.trim() || null,
          dlNumber: dlNumber.trim() || null,
          dlExpiry: dlExpiry.trim() || null,
          status,
          vehicle: {
            vehicleType,
            make: vehicleMake.trim(),
            model: vehicleModel.trim(),
            registrationNumber: registrationNumber.trim().toUpperCase(),
          },
        },
      });
    } catch (err: any) {
      // Fallback: If backend is older and returns 404 for PATCH /v1/admin/driver-applications/:id,
      // fallback to PATCH /v1/admin/driver-applications/:id/status if status changed.
      const statusChanged = (driver?.status ?? 'ACTIVE') !== status;
      if (
        (err?.statusCode === 404 || err?.status === 404) &&
        statusChanged
      ) {
        try {
          await updateStatusMutation.mutateAsync({
            id: application.id,
            status,
          });
          onOpenChange(false);
          onSuccess?.();
          return;
        } catch (statusErr: any) {
          setErrorMessage(
            statusErr?.message || 'Failed to update driver status.'
          );
          return;
        }
      }

      setErrorMessage(
        err?.message ||
          'Failed to update driver profile. Please verify your inputs and try again.'
      );
    }
  };

  const isPending =
    updateProfileMutation.isPending || updateStatusMutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isPending) onOpenChange(next);
      }}
      title={`Edit Driver: ${name || phone || 'Driver Profile'}`}
      description="Update driver account details, contact numbers, licence, and vehicle assignment"
      className="max-w-2xl max-h-[90vh] overflow-y-auto"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-6 py-2">
        {errorMessage && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
            <AlertTriangle className="size-4 shrink-0 mt-0.5 text-rose-600" />
            <div className="flex-1">{errorMessage}</div>
          </div>
        )}

        {noticeMessage && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
            <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-600" />
            <div className="flex-1">{noticeMessage}</div>
          </div>
        )}

        {/* Section 1: Personal & Contact Information */}
        <div className="flex flex-col gap-3.5 p-4 rounded-xl border border-border bg-surface">
          <div className="flex items-center gap-2 text-xs font-semibold text-text uppercase tracking-wider border-b border-border pb-2">
            <User className="size-4 text-interactive" />
            Personal & Contact Information
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-medium text-text mb-1">
                Driver Full Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Manik Saha"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text mb-1">
                Primary Mobile (E.164)
              </label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+919876543210"
              />
              <span className="text-[10px] text-text-subtle mt-0.5 block">
                Include country code (e.g. +91)
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-text mb-1">
                Alternate Phone Number
              </label>
              <Input
                value={alternatePhone}
                onChange={(e) => setAlternatePhone(e.target.value)}
                placeholder="+919876543211"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text mb-1">
                Emergency Contact Number
              </label>
              <Input
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
                placeholder="+919876543212"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-text mb-1">
              Residential Address / City
            </label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 12/A Park Street, Kolkata, West Bengal"
            />
          </div>
        </div>

        {/* Section 2: Licence & Account Status */}
        <div className="flex flex-col gap-3.5 p-4 rounded-xl border border-border bg-surface">
          <div className="flex items-center gap-2 text-xs font-semibold text-text uppercase tracking-wider border-b border-border pb-2">
            <Shield className="size-4 text-interactive" />
            Licence & Account Status
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs font-medium text-text mb-1">
                Driving Licence (DL)
              </label>
              <Input
                value={dlNumber}
                onChange={(e) => setDlNumber(e.target.value.toUpperCase())}
                placeholder="WB0120220001234"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text mb-1">
                Licence Expiry Date
              </label>
              <Input
                type="date"
                value={dlExpiry}
                onChange={(e) => setDlExpiry(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text mb-1">
                Account Status
              </label>
              <Select
                value={status}
                onValueChange={(val) => setStatus(val as 'ACTIVE' | 'SUSPENDED')}
                options={STATUS_OPTIONS}
              />
            </div>
          </div>
        </div>

        {/* Section 3: Assigned Vehicle Information */}
        <div className="flex flex-col gap-3.5 p-4 rounded-xl border border-border bg-surface">
          <div className="flex items-center gap-2 text-xs font-semibold text-text uppercase tracking-wider border-b border-border pb-2">
            <Car className="size-4 text-interactive" />
            Assigned Vehicle Details
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-medium text-text mb-1">
                Vehicle Category
              </label>
              <Select
                value={vehicleType}
                onValueChange={(val) => setVehicleType(val as VehicleCategory)}
                options={VEHICLE_TYPE_OPTIONS}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text mb-1">
                Registration Plate Number
              </label>
              <Input
                value={registrationNumber}
                onChange={(e) =>
                  setRegistrationNumber(e.target.value.toUpperCase())
                }
                placeholder="WB74AB1234"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text mb-1">
                Vehicle Make / Brand
              </label>
              <Input
                value={vehicleMake}
                onChange={(e) => setVehicleMake(e.target.value)}
                placeholder="e.g. Maruti Suzuki, Bajaj, Mahindra"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text mb-1">
                Vehicle Model
              </label>
              <Input
                value={vehicleModel}
                onChange={(e) => setVehicleModel(e.target.value)}
                placeholder="e.g. WagonR, Compact 4S, Treo"
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>

          <Button
            type="submit"
            variant="primary"
            loading={isPending}
            icon={<CheckCircle2 className="size-4" />}
          >
            Save Changes
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
