export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, i)
  const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(decimals)} ${units[i]}`
}

export function formatShare(part: number, whole: number): string {
  if (whole <= 0 || part <= 0) return '0%'
  const percent = (part / whole) * 100
  return percent < 1 ? '<1%' : `${Math.round(percent)}%`
}

export function formatDate(ms: number): string {
  const locale = document.documentElement.lang || undefined
  return new Date(ms).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function shortPath(p: string, home: string): string {
  if (home && p.startsWith(home)) return '~' + p.slice(home.length)
  return p
}

export function baseName(p: string): string {
  const parts = p.split('/')
  return parts[parts.length - 1] || p
}

export function parentDir(p: string): string {
  const parts = p.split('/')
  parts.pop()
  return parts.join('/') || '/'
}
