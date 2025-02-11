import axios from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';

const WelcomeUser: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate()
  // const { state } = location;

  const addBalanceHandler = async () => {
    // const response = await axios.post('http://localhost:3090/api/balance' , 20000);

    // const response = await axios.post('http://localhost:3080/api/addBalance/add_balance', {
    //   balance: 30000,
    // });
    // console.log('add balance', response);


    const response = await axios.get('http://localhost:3080/api/getUsers');
    console.log('Users you fetch', response);

    const res = await axios.post('http://localhost:3080/api/addBalance/add_balance', {
      balance: 100,id: "679e01576bdce0a2128a6036"

    });
    console.log('add balance:', res);
  };

  const redirectToAddBalanceHandler =()=>{
    
    navigate('/datall/add-balance' , {replace: true})
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
