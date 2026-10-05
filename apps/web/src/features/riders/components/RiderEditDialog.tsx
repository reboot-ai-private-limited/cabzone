'use client';

import { useState, useEffect } from 'react';
import { Button, Dialog, FormField, Input } from '@cabzone/design-system';
import type { AdminRiderSummaryDto } from '@cabzone/contracts';
import { useUpdateRiderProfile } from '../hooks/useRiders';

interface RiderEditDialogProps {
  rider: AdminRiderSummaryDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function RiderEditDialog({
  rider,
  open,
  onOpenChange,
  onSuccess,
}: RiderEditDialogProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState('en');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (rider) {
      setName(rider.name ?? '');
      setEmail(rider.email ?? '');
      setPreferredLanguage(rider.preferredLanguage ?? 'en');
      setEmergencyName(rider.emergencyContact?.name ?? '');
      setEmergencyPhone(rider.emergencyContact?.phoneE164 ?? '');
      setFormError(null);
    }
  }, [rider, open]);

  const updateMutation = useUpdateRiderProfile(() => {
    onOpenChange(false);
    onSuccess?.();
  });

  if (!rider) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    let emergencyContact: { name: string; phoneE164: string } | null = null;
    if (emergencyName.trim() || emergencyPhone.trim()) {
      if (!emergencyName.trim()) {
        setFormError('Emergency contact name is required if contact is provided.');
        return;
      }
      if (!emergencyPhone.trim().startsWith('+')) {
        setFormError('Emergency contact phone must be in E.164 format (e.g. +919876543210).');
        return;
      }
      emergencyContact = {
        name: emergencyName.trim(),
        phoneE164: emergencyPhone.trim(),
      };
    }

    updateMutation.mutate({
      id: rider.id,
      body: {
        name: name.trim() || null,
        email: email.trim() || null,
        preferredLanguage: preferredLanguage.trim() || null,
        emergencyContact,
      },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Customer Profile"
      description={`Update account details and safety preferences for ${rider.phoneE164}.`}
      footer={
        <>
          <Button size="sm" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={handleSubmit}
            loading={updateMutation.isPending}
          >
            Save Changes
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {formError && (
          <div className="rounded-md bg-danger/10 border border-danger/30 p-2.5 text-xs text-danger">
            {formError}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Full Name">
            {({ id, invalid }) => (
              <Input
                id={id}
                invalid={invalid}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Aditi Sharma"
              />
            )}
          </FormField>

          <FormField label="Email Address">
            {({ id, invalid }) => (
              <Input
                id={id}
                type="email"
                invalid={invalid}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. aditi@example.com"
              />
            )}
          </FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Registered Phone Number" hint="Primary login credential (read-only)">
            {({ id }) => (
              <Input
                id={id}
                disabled
                value={rider.phoneE164}
                className="bg-surface-muted text-text-subtle font-mono"
              />
            )}
          </FormField>

          <FormField label="Preferred Language">
            {({ id, invalid }) => (
              <Input
                id={id}
                invalid={invalid}
                value={preferredLanguage}
                onChange={(e) => setPreferredLanguage(e.target.value)}
                placeholder="e.g. en, hi, bn"
              />
            )}
          </FormField>
        </div>

        <div className="mt-2 pt-3 border-t border-border flex flex-col gap-3">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-text">Emergency Contact (Safety)</span>
            <span className="text-[11px] text-text-subtle">
              Used for SOS alerts and critical ride notifications.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Contact Person Name">
              {({ id, invalid }) => (
                <Input
                  id={id}
                  invalid={invalid}
                  value={emergencyName}
                  onChange={(e) => setEmergencyName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                />
              )}
            </FormField>

            <FormField label="Contact Phone (E.164)" hint="Includes country code (+91...)">
              {({ id, invalid }) => (
                <Input
                  id={id}
                  invalid={invalid}
                  value={emergencyPhone}
                  onChange={(e) => setEmergencyPhone(e.target.value)}
                  placeholder="+919876543210"
                />
              )}
            </FormField>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
