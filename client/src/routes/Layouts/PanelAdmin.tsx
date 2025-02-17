import Register from '~/components/PanelAdmin/Register';
import RegisterWithRole from '~/components/PanelAdmin/RegisterWithRole';
import { Outlet, useLocation } from 'react-router-dom';
import { Box, Container, Typography } from '@mui/material';

const PanelAdmin: React.FC = () => {
  const location = useLocation();

  // return <>{location.pathname === '/panel-admin/welcome' ? <Outlet/> : <Register /> }</>
  // return <>{location.pathname === '/panel-admin/welcome' ? <Outlet/> : <RegisterWithRole /> }</>
  // return <div className="flex justify-center"><Outlet/> <div className=" bg-red-400 "></div></div>
  return (
    <Container sx={{ bgcolor: 'white', height: '100vh' }}>
      <Outlet />
      {/* <Typography variant='h1'>hello world!</Typography> */}
      {/* <Box sx={{width:{xs:100, md:200} ,height:200 ,bgcolor:'blueviolet'}}></Box> */}
      
    </Container>
  );
};

export default PanelAdmin;
