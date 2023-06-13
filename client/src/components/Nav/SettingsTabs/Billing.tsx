import React, { useCallback } from 'react';
import { useAuthContext } from "~/hooks/AuthContext";

function Billing() {
  const { user, triggerRefetch } = useAuthContext();

  const cancelSubscription = useCallback(async () => {
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
        console.log("Subscription canceled successfully");
        // Trigger a refetch of the user data
        triggerRefetch();
      } else {
        console.error("Failed to cancel the subscription");
      }
    } catch (error) {
      console.error("Error:", error.message);
    }
  }, [user, triggerRefetch]);

  return (
    <div>
      {/* Billing content goes here */}
      <button
        className="btn bg-red-600 text-white hover:bg-red-800"
        type="button"
        onClick={cancelSubscription}
      >
        Cancel Subscription
      </button>
    </div>
  );
}

export default React.memo(Billing);
