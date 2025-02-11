import Register from '~/components/Datall/Register';
import RegisterWithRole from '~/components/Datall/RegisterWithRole';
import { Outlet, useLocation } from 'react-router-dom';
import { Box, Container, Typography } from '@mui/material';

const Datall: React.FC = () => {
  const location = useLocation();

  // return <>{location.pathname === '/datall/welcome' ? <Outlet/> : <Register /> }</>
  // return <>{location.pathname === '/datall/welcome' ? <Outlet/> : <RegisterWithRole /> }</>
  // return <div className="flex justify-center"><Outlet/> <div className=" bg-red-400 "></div></div>
  return (
    <Container sx={{ bgcolor: 'white', height: '100vh' }}>
      <Outlet />
      {/* <Typography variant='h1'>hello world!</Typography> */}
      {/* <Box sx={{width:{xs:100, md:200} ,height:200 ,bgcolor:'blueviolet'}}></Box> */}
      
    </Container>
  );
};

export default Datall;
