import axios from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';

const WelcomeUser: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate()
  // const { state } = location;

  const addBalanceHandler = async () => {
    // const response = await axios.post('http://localhost:3090/api/balance' , 20000);

    // const response = await axios.post('http://localhost:3080/api/addBalance/', {
    //   balance: 30000,
    // });
    // console.log('add balance', response);


    const response = await axios.get('http://localhost:3080/api/getUsers');
    console.log('Users you fetch', response);

    const res = await axios.post('http://localhost:3080/api/addBalance/', {
      balance: 100,id: "679757526bca82593afec669"
    });
    console.log('add balance:', res);


    const res2 = await axios.get('http://localhost:3080/api/getUsers');
    console.log('Users after add balance fetch', res2);

  };

  const redirectToAddBalanceHandler =()=>{
    
    navigate('/panel-admin/user-management' , {replace: true})
  }

  return (
    <>
     {/* <div>Welcome dear {state.name} </div> */}
      {/* {state.name === 'admin' && (
        <button onClick={addBalanceHandler} className="bg-red-500 px-2 text-white">
          add balance
        </button>
      )} */}
      <button onClick={addBalanceHandler} className="bg-red-500 px-2 text-white">
          add balance
        </button>
      <button onClick={redirectToAddBalanceHandler} className="bg-green-500 px-2 text-white">go to addBalance</button>
    </>
  );
};

export default WelcomeUser;
