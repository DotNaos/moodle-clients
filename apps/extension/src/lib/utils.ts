import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function uniqueBy<TItem, TKey>(
  items: TItem[],
  getKey: (item: TItem) => TKey,
): TItem[] {
  const seenKeys = new Set<TKey>()

  return items.filter((item) => {
    const key = getKey(item)

    if (seenKeys.has(key)) {
      return false
    }

    seenKeys.add(key)
    return true
  })
}
