import React, { useCallback, useState } from 'react';
import { useAuthContext } from "~/hooks/AuthContext";
import Spinner from "../../svg/Spinner";

function Billing() {
  const { user } = useAuthContext();
  const [isLoading, setIsLoading] = useState(false);

  const cancelSubscription = useCallback(async () => {
    setIsLoading(true); // Set loading state to true when cancellation starts

    try {
      const response = await fetch("/api/stripe/cancel-subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // Pass the subscription ID from user object
          subscriptionId: user.stripeSubscriptionId,
        }),
      });
  
      if (response.ok) {
        console.log(response);
        console.log("Subscription canceled successfully");
        
        // Add this line to refresh the page
        window.location.reload();
      } else {
        console.error("Failed to cancel the subscription");
      }
    } catch (error) {
      console.log(error);
      console.error("Error:", error.message);
    } finally {
      setIsLoading(false); // Set loading state back to false when cancellation ends
    }
  }, [user]);
  
  return (
    <div>
      {/* Billing content goes here */}
      { user.subscriptionStatus === 'active' ? (
        <button
          className="btn bg-red-600 text-white hover:bg-red-800"
          type="button"
          onClick={cancelSubscription}
          disabled={isLoading} 
        >
          { isLoading ? <Spinner /> : 'Cancel Subscription' }
        </button>
      ) : (
        <p>No active subscription.</p>
      ) }
    </div>
  );
}

export default React.memo(Billing);