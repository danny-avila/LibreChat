import Register from "~/components/Datall/Register";
import { Outlet, useLocation } from "react-router-dom";


const Datall:React.FC =() =>{
    const location = useLocation()

    return <>{location.pathname === '/datall/welcome' ? <Outlet/> : <Register /> }</>
}

export default Datall
   
    
