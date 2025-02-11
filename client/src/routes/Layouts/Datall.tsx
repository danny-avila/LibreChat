import Register from "~/components/Datall/Register";
import RegisterWithRole from "~/components/Datall/RegisterWithRole";
import { Outlet, useLocation } from "react-router-dom";


const Datall:React.FC =() =>{
    const location = useLocation()

    // return <>{location.pathname === '/datall/welcome' ? <Outlet/> : <Register /> }</>
    // return <>{location.pathname === '/datall/welcome' ? <Outlet/> : <RegisterWithRole /> }</>
    return <><Outlet/></>

}

export default Datall
   
    
