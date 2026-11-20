import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Support | Cabzone',
  description: 'Get help with the Cabzone Rider and Cabzone Driver apps: bookings, fares, payments, safety and your account.',
};

const email = 'cabzonehelp@gmail.com';

const topics: Array<{ title: string; body: string }> = [
  {
    title: 'Booking or a ride problem',
    body: 'Open the app, go to Activity, and pick the trip. Email us the trip details and what went wrong.',
  },
  {
    title: 'Fare or payment dispute',
    body: 'You pay your driver directly in cash or UPI, at the fare you agreed before the ride. In the Rider app, open Profile > Help & Payment Disputes. You can also email us with the trip date, pickup and drop.',
  },
  {
    title: 'Sign-in and OTP',
    body: 'Cabzone signs you in with a 6-digit code sent by SMS to your mobile number. If the code does not arrive, check your number and network, wait a minute, then tap resend.',
  },
  {
    title: 'Driver account and documents',
    body: 'Drivers can email us about KYC documents, approval status, wallet or payouts. Please include the phone number registered with your driver account.',
  },
  {
    title: 'Safety concerns',
    body: 'If you are in danger, call 112 (India emergency number) first. Then tell us what happened so we can act on the report.',
  },
];

export default function SupportPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-8 px-6 py-12 text-text">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Cabzone Support</h1>
        <p>
          Need help with a ride, a payment or your account? We support the <strong>Cabzone</strong>{' '}
          (Rider) and <strong>Cabzone: Driver</strong> apps.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Contact us</h2>
        <p>
          Email{' '}
          <a className="underline" href={`mailto:${email}`}>
            {email}
          </a>
          . We acknowledge every message within 48 hours.
        </p>
        <a
          className="inline-block rounded-lg bg-amber-400 px-5 py-3 font-semibold text-stone-900"
          href={`mailto:${email}?subject=${encodeURIComponent('Cabzone support request')}&body=${encodeURIComponent('App: Rider / Driver\nPhone number on my account: \nWhat happened: \n')}`}
        >
          Email support
        </a>
        <p className="text-sm opacity-80">
          Include the app (Rider or Driver), the phone number on your account, and the date of the
          trip if it is about a ride. Never send an OTP or password by email.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Common topics</h2>
        {topics.map((topic) => (
          <div key={topic.title} className="space-y-1">
            <h3 className="font-semibold">{topic.title}</h3>
            <p className="text-sm">{topic.body}</p>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Your account and data</h2>
        <ul className="list-disc space-y-2 pl-6 text-sm">
          <li>
            Delete your account:{' '}
            <Link className="underline" href="/account-deletion">
              request account deletion
            </Link>
            .
          </li>
          <li>
            How we handle your data:{' '}
            <Link className="underline" href="/privacy">
              Privacy Policy
            </Link>
            .
          </li>
        </ul>
      </section>

      <p className="text-sm opacity-80">
        Cabzone connects riders with independent drivers and is currently available in and around
        Siliguri, West Bengal.
      </p>
    </main>
  );
}
