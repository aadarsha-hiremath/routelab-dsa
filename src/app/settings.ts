export const speeds = [0.5, 1, 2, 4, 8]
export type Preferences = {
  theme: 'dark' | 'light' | 'system'
  speed: number
  motion: boolean
  grid: boolean
  snap: boolean
  minimap: boolean
}
export const defaults: Preferences = {
  theme: 'dark',
  speed: 1,
  motion: false,
  grid: true,
  snap: false,
  minimap: true,
}
export const storageKey = 'routelab.preferences.v2'
export function readPrefs(storage: Pick<Storage, 'getItem'>): Preferences {
  try {
    const v = JSON.parse(storage.getItem(storageKey) ?? '{}')
    return {
      theme: ['dark', 'light', 'system'].includes(v.theme) ? v.theme : defaults.theme,
      speed: speeds.includes(v.speed) ? v.speed : defaults.speed,
      ...Object.fromEntries(
        (['motion', 'grid', 'snap', 'minimap'] as const).map((k) => [
          k,
          typeof v[k] === 'boolean' ? v[k] : defaults[k],
        ]),
      ),
    } as Preferences
  } catch {
    return { ...defaults }
  }
}
