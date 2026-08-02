import { getThemeFromEnv } from './getThemeFromEnv';

const originalThemeEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => key.startsWith('REACT_APP_THEME_')),
);

const clearThemeEnv = () => {
  Object.keys(process.env)
    .filter((key) => key.startsWith('REACT_APP_THEME_'))
    .forEach((key) => delete process.env[key]);
};

beforeEach(clearThemeEnv);

afterAll(() => {
  clearThemeEnv();
  Object.assign(process.env, originalThemeEnv);
});

describe('getThemeFromEnv', () => {
  it('loads link and accent colors', () => {
    process.env.REACT_APP_THEME_LINK = '1 2 3';
    process.env.REACT_APP_THEME_LINK_HOVER = '4 5 6';
    process.env.REACT_APP_THEME_LINK_VISITED = '7 8 9';
    process.env.REACT_APP_THEME_ACCENT_PRIMARY = '10 11 12';
    process.env.REACT_APP_THEME_ACCENT_PRIMARY_HOVER = '13 14 15';

    expect(getThemeFromEnv()).toEqual({
      'rgb-link': '1 2 3',
      'rgb-link-hover': '4 5 6',
      'rgb-link-visited': '7 8 9',
      'rgb-accent-primary': '10 11 12',
      'rgb-accent-primary-hover': '13 14 15',
    });
  });

  it('loads status, inverted, fixed and destructive colors', () => {
    process.env.REACT_APP_THEME_STATUS_ERROR = '1 2 3';
    process.env.REACT_APP_THEME_STATUS_SUCCESS_SUBTLE = '4 5 6';
    process.env.REACT_APP_THEME_STATUS_NEUTRAL_BORDER = '7 8 9';
    process.env.REACT_APP_THEME_TEXT_DESTRUCTIVE = '10 11 12';
    process.env.REACT_APP_THEME_BORDER_DESTRUCTIVE = '13 14 15';
    process.env.REACT_APP_THEME_SURFACE_INVERTED = '16 17 18';
    process.env.REACT_APP_THEME_TEXT_INVERTED = '19 20 21';
    process.env.REACT_APP_THEME_SURFACE_FIXED_HOVER = '22 23 24';
    process.env.REACT_APP_THEME_TEXT_FIXED = '25 26 27';

    expect(getThemeFromEnv()).toEqual({
      'rgb-status-error': '1 2 3',
      'rgb-status-success-subtle': '4 5 6',
      'rgb-status-neutral-border': '7 8 9',
      'rgb-text-destructive': '10 11 12',
      'rgb-border-destructive': '13 14 15',
      'rgb-surface-inverted': '16 17 18',
      'rgb-text-inverted': '19 20 21',
      'rgb-surface-fixed-hover': '22 23 24',
      'rgb-text-fixed': '25 26 27',
    });
  });

  it('returns undefined when no theme variables are set', () => {
    expect(getThemeFromEnv()).toBeUndefined();
  });
});
