import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

const PaypalReturnHandler = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const paymentId = searchParams.get('paymentId');
    const PayerID = searchParams.get('PayerID');
    console.log('Payment ID:', paymentId); // Log the paymentId
    console.log('Payer ID:', PayerID); // Log the PayerID
    // 'userId' is removed from the client-side logic to prevent security risks.

    if (paymentId && PayerID) {
      // Only PayerID and paymentId are included in the request to the backend
      const queryParams = new URLSearchParams({ PayerID, paymentId }).toString();

      // Call your backend to finalize the payment
      fetch(`/api/payments/success?${queryParams}`, {
        method: 'GET',
        credentials: 'include', // Necessary for including session cookies
        headers: {
          'Content-Type': 'application/json',
          // Additional headers can be added here if needed
        },
      })
        .then(response => {
          if (!response.ok) {
            throw new Error(`Network response was not ok: ${response.statusText}`);
          }
          return response.json();
        })
        .then(data => {
        // Since 'userId' is no longer in the URL, you should retrieve it from 'data' if needed
          console.debug('Payment processed successfully:', data);
          // Navigate to a success page, using route parameters or state to pass any needed data
          navigate('/subscription/payment-success', { state: { paymentDetails: data } });
        })
        .catch(error => {
          console.error('Error processing payment:', error);
          // Handle errors by navigating to an error page and passing error details
          navigate('/subscription/payment-error', { state: { error: error.message } });
        });
    } else {
      console.error('Payment ID or Payer ID is missing.');
      // Navigate to an error page if necessary information is missing
      navigate('/subscription/payment-error', { state: { error: 'Missing payment information.' } });
    }
  }, [searchParams, navigate]);

  // Render a loading state or any other UI feedback while the payment is being processed
  return <div>Processing your payment...</div>;
};

export default PaypalReturnHandler;
