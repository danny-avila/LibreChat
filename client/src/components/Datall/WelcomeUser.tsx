import axios from 'axios';
import { useLocation } from 'react-router-dom';

const WelcomeUser: React.FC = () => {
  const location = useLocation();
  const { state } = location;

  const addBalanceHandler = async () => {
    // const response = await axios.post('http://localhost:3090/api/balance' , 20000);

  const response = await axios.post('http://localhost:3080/api/addBalance/add_balance',{balance:30000})
    console.log('add balance' ,response);
  };

  return (
    <>
      <div>Welcome dear {state.name} </div>
      {state.name === 'admin' && (
        <button onClick={addBalanceHandler} className="bg-red-500 px-2 text-white">
          add balance
        </button>
      )}
    </>
  );
};

export default WelcomeUser;
