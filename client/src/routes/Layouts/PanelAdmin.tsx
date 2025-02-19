import Register from '~/components/PanelAdmin/Register';
import RegisterWithRole from '~/components/PanelAdmin/RegisterWithRole';
import { Outlet, useLocation } from 'react-router-dom';
import { Box, Button, Container, CssBaseline, Typography } from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material';
import { useMemo, useState } from 'react';

// const theme = createTheme({
//   colorSchemes:{
//     dark: true
//   },
//   palette:{
//     primary:{
//       main: '#2d6a4f'
//     },secondary:{
//       main:'#74c69d'
//     }
//   }
// })

const PanelAdmin: React.FC = () => {
  const [mode, setMode] = useState<'light' | 'dark'>('light');

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
  const toggleTheme = () => {
    setMode((prevMode) => (prevMode === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      
        <Button variant="contained" onClick={toggleTheme} sx={{position:'fixed', top:77 ,left:50 , fontWeight: 'bold',
                
                backgroundColor: 'primary.main',
                color: '#fff',
                borderColor: 'primary.main',}}>
          Toggle Theme
        </Button>
      

      <Container sx={{ height: '100vh' }}>
        <Outlet />
      </Container>
    </ThemeProvider>
  );
};

export default PanelAdmin;
