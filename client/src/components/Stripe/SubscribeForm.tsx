import React, { useState } from "react";
import axios from 'axios';
import { useAuthContext } from '~/hooks/AuthContext';
import { useForm } from "react-hook-form";
import { CardElement, useElements, useStripe, Elements } from "@stripe/react-stripe-js";
import { Button } from '../ui/Button';
import Spinner from "../svg/Spinner";
import { loadStripe } from "@stripe/stripe-js";
import './SubscribeForm.css';

// Add your publishable key
const stripePromise = loadStripe("pk_test_51MwvEEHKD0byXXClhlIY96bsuIIIcdGgTenVqBnktRp8fzoUHlcI29yTj9ktyqumu2Xk1uz7KptFryWfTZz5Sdj200f3cPZSa3");

const SubscribeForm = () => {
  const { user } = useAuthContext();
  const { handleSubmit } = useForm();
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);

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
    <form className="subscription-form" onSubmit={handleSubmit(onSubmit)}>
      <h2>Subscribe</h2>
      <label htmlFor="card" className="card-label">Card details</label>
      <div className="card-element-wrapper">
        <CardElement id="card" className="card-element" />
      </div>
      <Button variant="green" className="w-full" type="submit" disabled={isLoading}>
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
