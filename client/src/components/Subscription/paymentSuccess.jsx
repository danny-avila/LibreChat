import React, { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import './PaymentMessages.css'; // Import the CSS file
import { useRecoilValue } from 'recoil';
import store from '~/store';
import { localize } from '~/localization/Translation';

const PaymentSuccess = () => {
  const { userId } = useParams();
  const [searchParams] = useSearchParams();
  const lang = useRecoilValue(store.lang);
  const paymentId = searchParams.get('paymentId');
  const subscriptionStartDate = searchParams.get('subscriptionStartDate');
  const expirationDate = searchParams.get('expirationDate');

  useEffect(() => {
    console.log(`Payment successful for user ID: ${userId} with Payment ID: ${paymentId}`);
    console.log(`Start Time: ${subscriptionStartDate}, End Time: ${expirationDate}`);
  }, [userId, paymentId, subscriptionStartDate, expirationDate]);

  return (
    <div className="payment-message-container">
      <div className="payment-message payment-success">
        <h1 className="title">{localize(lang, 'com_ui_confirmation_for_subscribing')}</h1>
        <p></p>
        <p>{localize(lang, 'com_ui_thanks_for_subscribing')}</p>
        <p>{localize(lang, 'com_ui_access_info').replace('{subscriptionStartDate}', subscriptionStartDate).replace('{expirationDate}', expirationDate)}</p>
        <p>{localize(lang, 'com_ui_renewal_reminder').replace('{expirationDate}', expirationDate)}</p>
      </div>
    </div>
  );
};

export default PaymentSuccess;
