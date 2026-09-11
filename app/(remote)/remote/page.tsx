import RemoteClient from "./RemoteClient";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export default async function RemotePage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = params.session;
  const candidate = typeof raw === "string" ? raw : null;
  const sessionId = candidate !== null && isUuid(candidate) ? candidate : null;

  return <RemoteClient sessionId={sessionId} />;
}
