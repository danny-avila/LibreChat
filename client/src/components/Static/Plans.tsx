import React from 'react';
import { useNavigate } from 'react-router-dom';
import '~/custom-theme.css';
import StaticFooter from './StaticFooter'

export default function Plans() {
  const navigate = useNavigate();
  return (
  <main className="plans" aria-labelledby="plans-heading">

    <header>
      <h1>Choose a DeclaRAY plan</h1>
      <p>Get answers, insights, and support for your HOA or condo—choose a plan to start making sense of your governing documents today.</p>
    </header>
        
    <section className="card" aria-label="Monthly plan">
      <div className="plan-header">
        <div>
          <p className="plan-title">Monthly</p>
          <p className="plan-sub">Clarity on demand — no long-term commitment</p>
        </div>
        <div className="text-align-right">
          <div className="price" aria-hidden="true">$20.00<span className="font-size-18">/mo</span></div>
          <small className="muted">Cancel any time</small>
        </div>
      </div>

      <div className="features" aria-hidden="false">
        <div className="feature">Unlimited document Q&A — ask DeclaRAY about CC&Rs, bylaws, rules.</div>
        <div className="feature">Plain-language explanations and clause highlights.</div>
        <div className="feature">Access on web & mobile — wherever you manage your community.</div>
        <div className="feature">Secure & private — your documents never shared externally.</div>
      </div>

      <div className="cta" role="group" aria-label="Monthly plan actions">
        <button className="btn-primary" aria-label="Start monthly plan — $9 per month">Start Monthly</button>
        <div className="muted margin-left-auto">Billed monthly. No hidden fees.</div>
      </div>
    </section>

    <section className="card recommended" aria-label="Yearly plan — recommended">
      <div className="badge" aria-hidden="true">Save 20%</div>

      <div className="plan-header">
        <div>
          <p className="plan-title">Yearly</p>
          <p className="plan-sub">Peace of mind for owners & board members</p>
        </div>
        <div className="text-align-right">
          <div className="price" aria-hidden="true">$200<span className="font-size-18">/yr</span></div>
          <small className="muted">One annual payment — best value</small>
        </div>
      </div>

      <div className="features">
        <div className="feature">Everything in Monthly — plus:</div>
        <div className="feature">Priority access to new features & updates.</div>
        <div className="feature">Member resources: templates, sample letters, board guides.</div>
        <div className="feature">Dedicated tips for compliance & community communication.</div>
      </div>

      <div className="cta" role="group" aria-label="Yearly plan actions">
        <button className="btn-primary" aria-label="Start yearly plan — $86 per year">Start Yearly — Save 20%</button>
        <div className="muted margin-left-auto">Secure checkout • 30-day money-back guarantee</div>
      </div>
    </section>

    <StaticFooter/>  
    
  </main>
  );
}
