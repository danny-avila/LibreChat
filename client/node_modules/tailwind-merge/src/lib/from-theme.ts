import { ThemeGetter, ThemeObject } from './types'

export function fromTheme(key: string): ThemeGetter {
    const themeGetter = (theme: ThemeObject) => theme[key] || []

    themeGetter.isThemeGetter = true as const

    return themeGetter
}
