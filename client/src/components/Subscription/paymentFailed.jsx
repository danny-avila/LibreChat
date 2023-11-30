import React, { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import './PaymentMessages.css'; // Import the CSS file
import { useRecoilValue } from 'recoil';
import store from '~/store';
import { localize } from '~/localization/Translation';

const PaymentFailed = () => {
  const { userId } = useParams();
  const [searchParams] = useSearchParams();
  const lang = useRecoilValue(store.lang);
  const error = searchParams.get('error');

  useEffect(() => {
    console.log(`Payment failed for user ID: ${userId}. Error: ${error}`);
  }, [userId, error]);

  return (
    <div className="payment-message-container">
      <div className="payment-message payment-failed">
        <h1 className="title">{localize(lang, 'com_ui_payment_failed_title')}</h1>
        <p>{localize(lang, 'com_ui_encountered_issue').replace('{error}', error)}</p>
        <p>{localize(lang, 'com_ui_try_again_or_contact_support')}</p>
      </div>
    </div>
  );
};

export default PaymentFailed;

