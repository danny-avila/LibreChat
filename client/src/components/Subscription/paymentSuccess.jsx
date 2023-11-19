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
  const startTime = searchParams.get('startTime');
  const endTime = searchParams.get('endTime');

  useEffect(() => {
    console.log(`Payment successful for user ID: ${userId} with Payment ID: ${paymentId}`);
    console.log(`Start Time: ${startTime}, End Time: ${endTime}`);
  }, [userId, paymentId, startTime, endTime]);

  return (
    <div className="payment-message-container">
      <div className="payment-message payment-success">
        <h1 className="title">{localize(lang, 'com_ui_confirmation_for_subscribing')}</h1>
        <p></p>
        <p>{localize(lang, 'com_ui_thanks_for_subscribing')}</p>
        <p>{localize(lang, 'com_ui_access_info').replace('{startTime}', startTime).replace('{endTime}', endTime)}</p>
        <p>{localize(lang, 'com_ui_renewal_reminder').replace('{endTime}', endTime)}</p>
      </div>
    </div>
  );
};

export default PaymentSuccess;
