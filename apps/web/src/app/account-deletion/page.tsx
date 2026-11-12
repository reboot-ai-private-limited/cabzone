import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Request account deletion | Cabzone',
  description: 'Request deletion of a Cabzone Rider or Cabzone Driver account and its associated data.',
};

const email = 'cabzonehelp@gmail.com';
const requestLink = `mailto:${email}?subject=${encodeURIComponent('Cabzone account deletion request')}&body=${encodeURIComponent('Please delete my Cabzone account and associated data.\nApp: Rider / Driver\nPhone number on my account: \n')}`;

export default function AccountDeletionPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-text">
      <h1 className="text-3xl font-semibold">Request account deletion</h1>
      <p className="mt-6">
        To request deletion of your <strong>Cabzone</strong> (Rider) or{' '}
        <strong>Cabzone: Driver</strong> account and associated personal data, email{' '}
        <a className="underline" href={`mailto:${email}`}>{email}</a> or use the button below.
      </p>
      <ol className="mt-6 list-decimal space-y-3 pl-6">
        <li>Tell us whether you use the Rider or Driver app (or both).</li>
        <li>Include the phone number registered with your account so we can locate and verify it.</li>
        <li>Confirm that you want your account and associated personal data deleted.</li>
      </ol>
      <a className="mt-8 inline-block rounded-lg bg-amber-400 px-5 py-3 font-semibold text-stone-900" href={requestLink}>
        Email deletion request
      </a>

      <section className="mt-10 space-y-3">
        <h2 className="text-xl font-semibold">What data is deleted vs. retained</h2>
        <ul className="list-disc space-y-2 pl-6 text-sm">
          <li>
            <strong>Deleted within 30 days of verification:</strong> Account profile (name, email,
            profile photo), saved route templates, emergency safety contacts, active login sessions,
            push notification tokens, and stored driver KYC document files not subject to an active
            safety or legal investigation.
          </li>
          <li>
            <strong>Retained for legal, tax &amp; fraud compliance:</strong> Completed ride
            invoices, trip timestamps/fare snapshots, UPI payment references, and driver commission
            wallet ledger entries.
          </li>
          <li>
            <strong>Retention period:</strong> Retained records are kept in restricted, non-active
            form for <strong>7 years</strong> as required under applicable tax, financial
            accounting, and transport safety regulations, and are permanently purged thereafter.
          </li>
        </ul>
      </section>

      <p className="mt-8 text-sm">
        Cabzone verifies account ownership before acting on any deletion request. Never send an OTP,
        password, or raw identity document by email. Read our full{' '}
        <Link className="underline" href="/privacy">
          Privacy Policy
        </Link>
        .
      </p>
    </main>
  );
}
