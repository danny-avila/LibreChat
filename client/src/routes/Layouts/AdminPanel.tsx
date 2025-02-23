import { Outlet } from 'react-router-dom';
import {Container, CssBaseline} from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';

const AdminPanel: React.FC = () => {
  const [mode, setMode] = useState<'light' | 'dark'>(
    localStorage.getItem('color-theme') as 'light' | 'dark',
  );

  useEffect(() => {
    setMode(localStorage.getItem('color-theme') as 'light' | 'dark');
  }, [localStorage.getItem('color-theme')]);
 
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode, 
          primary: {
            main: mode === 'light' ? '#74c69d' : '#2d6a4f',
          },
          secondary: {
            main: mode === 'light' ? '#ffffff' : '#cccccc',
          },
          background: {
            default: mode === 'light' ? '#fff' : '#363434',
          },
        },
      }),
    [mode],
  );


  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container sx={{ height: '100vh' }}>
        <Outlet />
      </Container>
    </ThemeProvider>
  );
};

export default AdminPanel;
