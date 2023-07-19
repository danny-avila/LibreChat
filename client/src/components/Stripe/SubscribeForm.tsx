import React from "react";
import axios from 'axios';
import { useAuthContext } from '~/hooks/AuthContext';
import { Button } from '../ui/Button';
import './SubscribeForm.css';

const SubscribeForm = () => {
  const { user } = useAuthContext();

  const onSubmit = async (e) => {
    e.preventDefault();
    
    try {
      // Make a POST request to create a customer and get the customerId
      const customerResponse = await axios.post("/api/stripe/create-customer", {
        name: user.name,
        email: user.email,
        id: user.id // Include the user ID
      });
  
      const customerId = customerResponse.data.id;
  
      // Make a POST request to create a Checkout session and get the session URL
      const sessionResponse = await axios.post("/api/stripe/create-checkout-session", {
        priceId: "price_1NHVdDHKD0byXXClbugzBz84",
        customerId: customerId, 
        userId: user.id // Include the user ID
      });
  
      // Redirect to the Checkout session
      window.location.href = sessionResponse.data.url;
    } catch (error) {
      console.error("Error:", error);
      alert(`Error: ${error.message}`);
    }
  };  
  
  return (
    <form className="subscription-form bg-white rounded" onSubmit={onSubmit}>
      <Button variant="green" className="w-full bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline" type="submit">
        Checkout
      </Button>
    </form>
  );
};

export default SubscribeForm;
