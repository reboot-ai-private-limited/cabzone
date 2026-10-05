import { redirect } from 'next/navigation';

export default async function DriverIdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/drivers/applications/${id}`);
}
