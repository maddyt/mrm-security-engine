import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold text-ink">Page not found</h1>
      <p className="mt-2 text-sm text-sub">That page does not exist in the MRM Security Engine portal.</p>
      <Link href="/mrm" className="mt-6 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">
        Go to the overview
      </Link>
    </div>
  );
}
