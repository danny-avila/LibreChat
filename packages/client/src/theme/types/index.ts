/**
 * Defines the color channels. Passed to the context from each app.
 * RGB values should be in format "255 255 255" (space-separated)
 */
export interface IThemeRGB {
  // Text colors
  'rgb-text-primary'?: string;
  'rgb-text-secondary'?: string;
  'rgb-text-secondary-alt'?: string;
  'rgb-text-tertiary'?: string;
  'rgb-text-warning'?: string;

  // Ring colors
  'rgb-ring-primary'?: string;

  // Header colors
  'rgb-header-primary'?: string;
  'rgb-header-hover'?: string;
  'rgb-header-button-hover'?: string;

  // Surface colors
  'rgb-surface-active'?: string;
  'rgb-surface-active-alt'?: string;
  'rgb-surface-hover'?: string;
  'rgb-surface-hover-alt'?: string;
  'rgb-surface-primary'?: string;
  'rgb-surface-primary-alt'?: string;
  'rgb-surface-primary-contrast'?: string;
  'rgb-surface-secondary'?: string;
  'rgb-surface-secondary-alt'?: string;
  'rgb-surface-tertiary'?: string;
  'rgb-surface-tertiary-alt'?: string;
  'rgb-surface-dialog'?: string;
  'rgb-surface-submit'?: string;
  'rgb-surface-submit-hover'?: string;
  'rgb-surface-destructive'?: string;
  'rgb-surface-destructive-hover'?: string;
  'rgb-surface-chat'?: string;

  // Border colors
  'rgb-border-light'?: string;
  'rgb-border-medium'?: string;
  'rgb-border-medium-alt'?: string;
  'rgb-border-heavy'?: string;
  'rgb-border-xheavy'?: string;

  // Brand colors
  'rgb-brand-purple'?: string;

  // Presentation
  'rgb-presentation'?: string;

  // Utility colors
  'rgb-background'?: string;
  'rgb-foreground'?: string;
  'rgb-primary'?: string;
  'rgb-primary-foreground'?: string;
  'rgb-secondary'?: string;
  'rgb-secondary-foreground'?: string;
  'rgb-muted'?: string;
  'rgb-muted-foreground'?: string;
  'rgb-accent'?: string;
  'rgb-accent-foreground'?: string;
  'rgb-destructive-foreground'?: string;
  'rgb-border'?: string;
  'rgb-input'?: string;
  'rgb-ring'?: string;
  'rgb-card'?: string;
  'rgb-card-foreground'?: string;
}

/**
 * Name of the CSS variables used in tailwind.config
 */
export interface IThemeVariables {
  '--text-primary': string;
  '--text-secondary': string;
  '--text-secondary-alt': string;
  '--text-tertiary': string;
  '--text-warning': string;
  '--ring-primary': string;
  '--header-primary': string;
  '--header-hover': string;
  '--header-button-hover': string;
  '--surface-active': string;
  '--surface-active-alt': string;
  '--surface-hover': string;
  '--surface-hover-alt': string;
  '--surface-primary': string;
  '--surface-primary-alt': string;
  '--surface-primary-contrast': string;
  '--surface-secondary': string;
  '--surface-secondary-alt': string;
  '--surface-tertiary': string;
  '--surface-tertiary-alt': string;
  '--surface-dialog': string;
  '--surface-submit': string;
  '--surface-submit-hover': string;
  '--surface-destructive': string;
  '--surface-destructive-hover': string;
  '--surface-chat': string;
  '--border-light': string;
  '--border-medium': string;
  '--border-medium-alt': string;
  '--border-heavy': string;
  '--border-xheavy': string;
  '--brand-purple': string;
  '--presentation': string;

  // Utility variables
  '--background': string;
  '--foreground': string;
  '--primary': string;
  '--primary-foreground': string;
  '--secondary': string;
  '--secondary-foreground': string;
  '--muted': string;
  '--muted-foreground': string;
  '--accent': string;
  '--accent-foreground': string;
  '--destructive-foreground': string;
  '--border': string;
  '--input': string;
  '--ring': string;
  '--card': string;
  '--card-foreground': string;
}

/**
 * Name of the defined colors in the Tailwind theme
 */
export interface IThemeColors {
  'text-primary'?: string;
  'text-secondary'?: string;
  'text-secondary-alt'?: string;
  'text-tertiary'?: string;
  'text-warning'?: string;
  'ring-primary'?: string;
  'header-primary'?: string;
  'header-hover'?: string;
  'header-button-hover'?: string;
  'surface-active'?: string;
  'surface-active-alt'?: string;
  'surface-hover'?: string;
  'surface-hover-alt'?: string;
  'surface-primary'?: string;
  'surface-primary-alt'?: string;
  'surface-primary-contrast'?: string;
  'surface-secondary'?: string;
  'surface-secondary-alt'?: string;
  'surface-tertiary'?: string;
  'surface-tertiary-alt'?: string;
  'surface-dialog'?: string;
  'surface-submit'?: string;
  'surface-submit-hover'?: string;
  'surface-destructive'?: string;
  'surface-destructive-hover'?: string;
  'surface-chat'?: string;
  'border-light'?: string;
  'border-medium'?: string;
  'border-medium-alt'?: string;
  'border-heavy'?: string;
  'border-xheavy'?: string;
  'brand-purple'?: string;
  presentation?: string;

  // Utility colors
  background?: string;
  foreground?: string;
  primary?: string;
  'primary-foreground'?: string;
  secondary?: string;
  'secondary-foreground'?: string;
  muted?: string;
  'muted-foreground'?: string;
  accent?: string;
  'accent-foreground'?: string;
  'destructive-foreground'?: string;
  border?: string;
  input?: string;
  ring?: string;
  card?: string;
  'card-foreground'?: string;
}

export interface Theme {
  name: string;
  colors: IThemeRGB;
}
