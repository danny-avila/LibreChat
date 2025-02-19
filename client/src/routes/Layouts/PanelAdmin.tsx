import { Outlet } from 'react-router-dom';
import { Button, Container, CssBaseline, useMediaQuery } from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';

// const getInitialMode = () => {
//   // Check if a theme is saved in localStorage
//   const savedMode = localStorage.getItem('themeMode');
//   if (savedMode === 'light' || savedMode === 'dark') {
//     return savedMode;
//   }
//   // If no saved theme, use the system preference
//   const prefersDark =
//     window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
//   return prefersDark ? 'dark' : 'light';
// };

const PanelAdmin: React.FC = () => {
  const [mode, setMode] = useState<'light' | 'dark'>(
    localStorage.getItem('color-theme') as 'light' | 'dark',
  );

  useEffect(() => {
    setMode(localStorage.getItem('color-theme') as 'light' | 'dark');
  }, [localStorage.getItem('color-theme')]);
  // const [mode, setMode] = useState<'light' | 'dark'>(getInitialMode);

  // // Update localStorage whenever mode changes
  // useEffect(() => {
  //   localStorage.setItem('themeMode', mode);
  // }, [mode]);

  // // Listen for system theme changes (optional)
  // useEffect(() => {
  //   const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  //   const handleChange = (e: MediaQueryListEvent) => {
  //     // Only update if user hasn't manually selected a theme
  //     const saveMode = localStorage.getItem('themeMode');
  //     if (!saveMode) {
  //       setMode(e.matches ? 'dark' : 'light');
  //     }
  //   };

  //   mediaQuery.addEventListener('change', handleChange);

  //   return () => mediaQuery.removeEventListener('change', handleChange);

  // }, []);

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode, // Sets the MUI built‑in "light" or "dark" mode
          primary: {
            main: mode === 'light' ? '#74c69d' : '#2d6a4f',
          },
          secondary: {
            main: mode === 'light' ? '#ffffff' : '#cccccc',
          },
          // // Optionally you can also adjust background and text colors:
          background: {
            default: mode === 'light' ? '#fff' : '#363434',
          },
          // text: {
          //   primary: mode === 'light' ? '#000' : '#fff',
          //   secondary: mode === 'light' ? '#2d6a4f' : '#fff',
          // },
        },
      }),
    [mode],
  );

  // Toggles between light and dark modes
  // const toggleTheme = () => {
  //   setMode((prevMode) => (prevMode === 'light' ? 'dark' : 'light'));
  // };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />

      {/* <Button
        variant="contained"
        onClick={toggleTheme}
        sx={{
          position: 'fixed',
          top: 77,
          left: 50,
          fontWeight: 'bold',

          backgroundColor: 'primary.main',
          color: '#fff',
          borderColor: 'primary.main',
          zIndex: 1000,
        }}
      >
        Toggle Theme
      </Button> */}

      <Container sx={{ height: '100vh' }}>
        <Outlet />
      </Container>
    </ThemeProvider>
  );
};

export default PanelAdmin;
