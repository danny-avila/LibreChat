import React, { useEffect, useState } from "react";
import axios from 'axios';
import { useAuthContext } from '~/hooks/AuthContext';
import { useForm } from "react-hook-form";
import { CardElement, useElements, useStripe, Elements } from "@stripe/react-stripe-js";
import { Button } from '../ui/Button';
import Spinner from "../svg/Spinner";
import { loadStripe } from "@stripe/stripe-js";
import { gtag, install } from 'ga-gtag'; // Import ga-gtag
import './SubscribeForm.css';

// Add your publishable key
const stripePromise = loadStripe("pk_live_51MwvEEHKD0byXXCl8IzAvUl0oZ7RE6vIz72lWUVYl5rW3zy0u3FiGtIAgsbmqSHbhkTJeZjs5VEbQMNStaaQL9xQ001pwxI3RP");

const SubscribeForm = () => {
  const { user } = useAuthContext();
  const { handleSubmit } = useForm();
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Initialize Google AdWords gtag
    install('G-LL9W9MWZPP');
  }, []);

  const onSubmit = async () => {
    setIsLoading(true); // Start loading state
  
    try {
      const response = await axios.post("/api/stripe/create-customer", { name: user.name, email: user.email });
      const customerId = response.data.id;
  
      console.log("Customer Created:", customerId);
  
      const cardElement = elements.getElement(CardElement);
      const { paymentMethod, error } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement
      });
  
      if (error) {
        console.error("Payment Method Error:", error);
        return;
      }
        
      console.log("Payment Method Created:", paymentMethod.id);
  
      // Update: Capture the result of updating payment method from the API call
      const updatePaymentMethodResult = await axios.post("/api/stripe/update-payment-method", {
        customerId,
        paymentMethodId: paymentMethod.id
      });
  
      console.log("Payment Method Updated:", updatePaymentMethodResult.data);
      
      // Update: Capture the result of creating subscription from the API call
      const createSubscriptionResult = await axios.post("/api/stripe/create-subscription", {
        customerId,
        userId: user.id,
        priceId: "price_1NHVPpHKD0byXXClYlrta1Qu"
      });
  
      console.log("Subscription Created:", createSubscriptionResult.data);
      alert("Subscription successful!");
  
      // Track conversion event with Google AdWords
      gtag('event', 'conversion', { 'send_to': 'G-LL9W9MWZPP' });
  
      // Add this line to refresh the page
      window.location.reload();
    } catch (error) {
      console.error("Error:", error);
      alert(`Error: ${error.message}`);
    } finally {
      setIsLoading(false); // Reset loading state
    }
  };
  
  

  return (
    <form className="subscription-form bg-white rounded " onSubmit={handleSubmit(onSubmit)}>
      <div className="subscription-info mb-4">
        <p className="font-semibold text-gray-700">By subscribing, you will gain:</p>
        <ul className="list-disc list-inside text-gray-600">
          <li>Exclusive access to the gpt-4 model. 25 messages daily.</li>
          <li>Increased daily messaging limit: 500 messages/day (as opposed to 25 messages/day for unsubscribed users)</li>
        </ul>
      </div>
      
      <label htmlFor="card" className="card-label block text-gray-700 text-sm font-bold mb-2">Card details</label>
      <div className="card-element-wrapper mb-6">
        <CardElement id="card" className="card-element shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" />
      </div>
      <Button variant="green" className="w-full bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline" type="submit" disabled={isLoading}>
        {isLoading ? <Spinner /> : 'Submit'}
      </Button>

    </form>
  );
};



const WrappedSubscribeForm = () => {
  return (
    <Elements stripe={stripePromise}>
      <SubscribeForm />
    </Elements>
  );
}

export default WrappedSubscribeForm;
