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
});
