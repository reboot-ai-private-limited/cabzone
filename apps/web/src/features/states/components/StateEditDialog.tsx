'use client';

import { useId, useState } from 'react';
import { Button, Dialog, Input } from '@cabzone/design-system';
import type { StateBoundaryDto } from '@/lib/api/endpoints/states';
import { useUpdateState } from '../hooks/useStatesAdmin';

/**
 * Edits state metadata and serviceability. The boundary itself is never edited here; it only
 * changes through the controlled GeoJSON import.
 */
export function StateEditDialog({
  state,
  onOpenChange,
}: {
  state: StateBoundaryDto | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog
      open={state !== null}
      onOpenChange={onOpenChange}
      title={state === null ? '' : `Edit ${state.stateName}`}
      description="Serviceability decides whether Cabzon accepts rides ending in this state."
    >
      {/* Keyed so the form resets whenever a different state (or a newer version) is opened. */}
      {state !== null && (
        <EditForm key={`${state.stateCode}-${state.configVersion}`} state={state} onDone={() => onOpenChange(false)} />
      )}
    </Dialog>
  );
}

function EditForm({ state, onDone }: { state: StateBoundaryDto; onDone: () => void }) {
  const nameId = useId();
  const [name, setName] = useState(state.stateName);
  const [intrastate, setIntrastate] = useState(state.intrastateEnabled);
  const [interstate, setInterstate] = useState(state.interstateDropOffEnabled);
  const [error, setError] = useState<string | undefined>(undefined);
  const update = useUpdateState(() => onDone());

  const dirty =
    name.trim() !== state.stateName ||
    intrastate !== state.intrastateEnabled ||
    interstate !== state.interstateDropOffEnabled;

  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (name.trim() === '') {
      setError('Name is required.');
      return;
    }
    setError(undefined);
    update.mutate(
      {
        state,
        body: {
          stateName: name.trim(),
          intrastateEnabled: intrastate,
          interstateDropOffEnabled: interstate,
        },
      },
      {
        onError: (err) =>
          setError(
            err instanceof Error
              ? err.message
              : 'Could not save. Reload and try again — someone may have changed this state.',
          ),
      },
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 text-xs font-semibold text-text">
        <label htmlFor={nameId}>State name</label>
        <Input id={nameId} value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <Toggle
        label="Intrastate outstation"
        hint="Rides that start and end inside this state."
        checked={intrastate}
        onChange={setIntrastate}
      />
      <Toggle
        label="Interstate drop-off"
        hint="Rides from other states that end in this state."
        checked={interstate}
        onChange={setInterstate}
      />

      {error !== undefined && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={update.isPending} disabled={!dirty}>
          Save
        </Button>
      </div>
    </form>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3 text-sm text-text">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-4"
      />
      <label htmlFor={id} className="flex flex-col">
        <span className="font-semibold">{label}</span>
        <span className="text-xs text-text-subtle">{hint}</span>
      </label>
    </div>
  );
}
