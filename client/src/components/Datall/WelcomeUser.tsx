import { useLocation } from 'react-router-dom';

const WelcomeUser: React.FC = () => {
  const location = useLocation();
  const { state } = location;

  const addBalanceHandler = () => {
    console.log('add balance');
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
