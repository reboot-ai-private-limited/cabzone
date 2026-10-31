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
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (rider) {
      setName(rider.name ?? '');
      setEmail(rider.email ?? '');
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

    updateMutation.mutate({
      id: rider.id,
      body: {
        name: name.trim() || null,
        email: email.trim() || null,
      },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Customer Profile"
      description={`Update account details for ${rider.name || `Customer #${rider.id.slice(0, 8)}`}.`}
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


      </form>
    </Dialog>
  );
}
