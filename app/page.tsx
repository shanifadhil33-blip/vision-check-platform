import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">Vision Check Platform</h1>
      <p className="text-neutral-400">
        Phase A scaffold. Nothing is implemented yet.
      </p>
      <ul className="flex flex-col gap-2">
        <li>
          <Link className="underline underline-offset-4" href="/display">
            /display
          </Link>
          <span className="text-neutral-500"> — laptop, monitor or tablet</span>
        </li>
        <li>
          <Link className="underline underline-offset-4" href="/remote">
            /remote
          </Link>
          <span className="text-neutral-500"> — phone</span>
        </li>
        <li>
          <a className="underline underline-offset-4" href="/api/health">
            /api/health
          </a>
          <span className="text-neutral-500"> — deploy and database check</span>
        </li>
      </ul>
    </main>
  );
}
