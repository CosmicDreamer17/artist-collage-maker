export function getCandidateApiOrigins(currentPort?: string | null): string[] {
  const explicit = [
    process.env.INTERNAL_API_ORIGIN,
    process.env.NEXT_PUBLIC_API_URL,
  ].filter((value): value is string => Boolean(value && value.trim()));

  const localFallbacks = ['3002', '3001', '3000']
    .filter((port) => port !== currentPort)
    .map((port) => `http://127.0.0.1:${port}`);

  return Array.from(new Set([...explicit, ...localFallbacks]));
}
