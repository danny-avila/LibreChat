import React from 'react';
import { useNavigate } from 'react-router-dom';
import StaticFooter from './StaticFooter'
import '../../custom-theme.css';

export default function  Landing() {
  const navigate = useNavigate();
  return (
    <>
      <header>
        <h1>CRIB METRICS</h1>
        <p>Your AI-Powered Real Estate Market Analyst</p>
        <div className="cta-buttons">
          <button className="btn-primary btn-cta-primary" onClick={() => navigate('/c/new')}>Chat Now</button>
        </div>
      </header>

      <section>
        <h2 className="text-center">Real Estate Market Insights Made Simple</h2>
        <p className="text-center">Our AI analyzes market trends, property values, and neighborhood data to provide you with actionable insights. Our AI engines have access to the latest real estate sales data available to the public and is kept up to date monthly. Access data from the state level down to the zipcode.</p>
        <div className="cta-buttons">
          <button className="btn-primary btn-cta-primary" onClick={() => navigate('/c/new')}>Chat Now</button>
        </div>        
      </section>      

      <StaticFooter />
    </>
  );
}
