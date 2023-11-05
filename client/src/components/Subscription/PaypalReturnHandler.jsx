import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

const PaypalReturnHandler = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const paymentId = searchParams.get('paymentId');
    const PayerID = searchParams.get('PayerID');
    const userId = searchParams.get('userId'); // Retrieve the userId from the URL

    console.debug('Payment ID:', paymentId);
    console.debug('Payer ID:', PayerID);
    // console.debug('User ID:', userId);

    if (paymentId && PayerID) {
      // Construct the query params string with all necessary data
      const queryParams = new URLSearchParams({ PayerID, paymentId }).toString();
      console.debug('Query Params:', queryParams);

      // Call your backend to finalize the payment
      fetch(`http://localhost:3080/api/success?${queryParams}`, {
        method: 'GET',
        credentials: 'include', // Necessary for including cookies for session-based authentication
        headers: {
          // Add any required headers
          'Content-Type': 'application/json'
        },
      })
        .then(response => {
          if (!response.ok) {
            throw new Error(`Network response was not ok: ${response.statusText}`);
          }
          return response.json();
        })
        .then(data => {
          console.debug('Payment processed successfully:', data);
          navigate(`/subscription/${userId}/payment-success`);
        })
        .catch(error => {
          console.error('Error processing payment:', error);
          if (error.message.includes('Network response was not ok')) {
          // Handle network errors differently if needed
            navigate(`/subscription/${userId}/payment-error?message=network_error`);
          } else {
            navigate(`/subscription/${userId}/payment-failed?message=${error.message}`);
          }
        });
    } else {
      console.error('Payment ID, Payer ID, or User ID is missing.');
    }
  }, [searchParams, navigate]);

  // Render a loading state while the payment is being processed.
  return <div>Processing your payment...</div>;
};

export default PaypalReturnHandler;
