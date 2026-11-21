export function parseVersion(value: string): number[] | null {
  const normalized = value.trim().replace(/^v/i, '').split('-')[0] ?? ''
  if (!normalized)
    return null
  const segments = normalized.split('.')
  if (!segments.every(segment => /^\d+$/.test(segment)))
    return null
  return segments.map(Number)
}

export function isNewerVersion(latest: string, current: string): boolean {
  const next = parseVersion(latest)
  const base = parseVersion(current)
  if (!next || !base)
    return false
  for (let index = 0; index < Math.max(next.length, base.length); index++) {
    const left = next[index] ?? 0
    const right = base[index] ?? 0
    if (left !== right)
      return left > right
  }
  return false
}
