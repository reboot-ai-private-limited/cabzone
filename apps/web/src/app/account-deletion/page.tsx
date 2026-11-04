import type { Metadata } from 'next';

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
        To request deletion of your Cabzone Rider or Cabzone Driver account and associated data,
        email <a className="underline" href={`mailto:${email}`}>{email}</a>.
      </p>
      <ol className="mt-6 list-decimal space-y-3 pl-6">
        <li>Tell us whether you use the Rider or Driver app.</li>
        <li>Include the phone number registered with your account so we can locate it.</li>
        <li>Ask us to delete your account and associated data.</li>
      </ol>
      <a className="mt-8 inline-block rounded-lg bg-amber-400 px-5 py-3 font-semibold text-stone-900" href={requestLink}>
        Email deletion request
      </a>
      <p className="mt-8 text-sm">
        Cabzone will verify account ownership before acting on the request and explain any data
        that must be retained for legal or payment reasons. Never send an OTP, password, or identity
        document by email.
      </p>
    </main>
  );
}
