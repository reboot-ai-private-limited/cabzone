import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy | Cabzone',
  description: 'Privacy Policy for the Cabzone Rider and Cabzone Driver mobile applications.',
};

const email = 'cabzonehelp@gmail.com';

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-12 text-text">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Cabzone Privacy Policy</h1>
        <p className="text-sm opacity-80">Last updated: November 12, 2026</p>
      </header>

      <p>
        This Privacy Policy explains how Cabzone collects, uses, shares, and protects personal data
        across the <strong>Cabzone</strong> (`in.cabzone.rider`) and{' '}
        <strong>Cabzone: Driver</strong> (`in.cabzone.driver`) mobile applications and related
        services.
      </p>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">1. Information We Collect</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Account &amp; Profile Data:</strong> Phone number, name, optional email address,
            preferred language, and optional emergency safety contact details.
          </li>
          <li>
            <strong>Driver KYC &amp; Vehicle Data (Driver App):</strong> Profile photo, address,
            date of birth, vehicle registration details, Driving Licence, Registration Certificate
            (RC), Commercial Insurance, and Route Permit documents.
          </li>
          <li>
            <strong>Location Data:</strong>
            <ul className="mt-1 list-disc space-y-1 pl-6">
              <li>
                <strong>Rider App:</strong> Collects foreground location while the app is in use to
                detect pickup points, calculate route quotes, and display trip progress.
              </li>
              <li>
                <strong>Driver App:</strong> Collects precise foreground and background location
                data to enable nearby ride offers, live pickup ETAs, and active trip safety tracking{' '}
                <strong>even when the app is closed or not in use</strong> while the driver is set
                to Online or on an active trip.
              </li>
            </ul>
          </li>
          <li>
            <strong>In-App Calls &amp; Messages:</strong> Microphone audio is transmitted in real
            time only when you place or answer an optional in-app voice call with your matched
            rider or driver (calls are not recorded). Trip chat messages are stored with the ride
            for coordination and dispute support.
          </li>
          <li>
            <strong>Trip, Payment &amp; Device Data:</strong> Pickup/drop coordinates, fare quotes,
            UPI transaction references, driver wallet ledger entries, and push notification tokens
            (Firebase Cloud Messaging) for ride and call alerts.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">2. How We Use &amp; Share Information</h2>
        <p>
          We use your data strictly to authenticate accounts, match riders with nearby verified
          drivers, lock transparent trip fares, process payments, provide live ride updates and
          in-app voice calls, verify driver regulatory compliance, and resolve support or safety
          incidents.
        </p>
        <p>
          During an assigned ride, limited trip details (first name, pickup/drop points, vehicle
          details, and live trip location) are shared between the matched rider and driver. We rely
          on trusted infrastructure providers (such as cloud hosting, map/routing services, payment
          gateways, real-time audio, and push notifications) under strict confidentiality, and we{' '}
          <strong>never sell personal or location data to third-party advertisers</strong>.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">3. Data Security</h2>
        <p>
          All network communication between Cabzone mobile applications and our servers is encrypted
          in transit using HTTPS/TLS, with role-based access controls protecting stored records.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">4. Data Retention &amp; Account Deletion</h2>
        <p>
          Active account data is retained while your account remains open. You may request deletion
          of your account and personal data at any time from within the Rider or Driver app or via
          our{' '}
          <Link className="underline" href="/account-deletion">
            Account Deletion page
          </Link>
          . Upon verified deletion, profile data, saved routes, emergency contacts, and push tokens
          are deleted within 30 days, while completed trip invoices, payment references, and ledger
          records are retained for 7 years to comply with tax, accounting, and transport safety
          regulations before permanent removal.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">5. Contact Us</h2>
        <p>
          For privacy questions, data access, or deletion inquiries, contact us at{' '}
          <a className="underline" href={`mailto:${email}`}>
            {email}
          </a>
          .
        </p>
      </section>
    </main>
  );
}
