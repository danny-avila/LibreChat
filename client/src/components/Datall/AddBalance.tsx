import axios from 'axios';
import { useEffect, useState } from 'react';

interface User {
  name: string;
  username: string;
  role: string;
  id: string;
  email: string
}

const AddBalance: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    const getUsers = async () => {
      const res = await axios.get('http://localhost:3090/api/getUsers');

      const filteredUsers = res.data.map((item: any) => ({
        name: item.name,
        username: item.username,
        role: item.role,
        id: item._id,
        email: item.email
      }));
      console.log(res);
      setUsers(filteredUsers);
    };

    getUsers();
  }, []);

  return (
    <>
      {users.map((item) => (
        <div className='bg-red-200 color-white mb-2'>{item.name} {item.username} {item.role} {item.id} {item.email}</div>
      ))}
    </>
  );
};

export default AddBalance;
