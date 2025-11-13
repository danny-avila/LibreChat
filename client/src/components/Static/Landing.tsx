import React from 'react';
import { useNavigate } from 'react-router-dom';
import StaticFooter from './StaticFooter'
import '../../custom-theme.css';

export default function  Landing() {
  const navigate = useNavigate();
  return (
    <>
      <header>
        <h1>Understand Your HOA Documents Instantly</h1>
        <p>DeclaRAY is your AI-powered assistant for interpreting condominium and HOA documents — helping you make sense of CC&Rs, bylaws, and board policies in plain English.</p>
        <div className="cta-buttons">
          <button className="btn-cta-primary" onClick={() => navigate('/register')}>Try DeclaRAY Free</button>
          <button className="btn-cta-secondary" onClick={() => navigate('/plans')} >Choose a Plan</button>
        </div>
      </header>

      <section>
        <h2 className="text-center">HOA Rules Don’t Have to Be Complicated</h2>
        <p>If you’ve ever struggled to decode your condo association’s covenants or bylaws, you’re not alone. DeclaRAY makes it easy — upload your documents or ask a question, and get a clear, accurate answer in seconds.</p>
      </section>      

      <section>
        <h2 className="text-center">How It Works</h2>
        <div className="steps">
          <div className="step">
            <h3>1. Upload or Link Documents</h3>
            <p>Attach your CC&Rs, bylaws, and meeting notes securely. DeclaRAY will analyze them instantly.</p>
          </div>
          <div className="step">
            <h3>2. Ask in Plain Language</h3>
            <p>Type questions like “Can I add solar panels?” or “Who maintains the balcony?” and get clear guidance.</p>
          </div>
          <div className="step">
            <h3>3. Get a Clear Answer</h3>
            <p>Receive an easy-to-understand explanation, plus citations from your governing documents.</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-center">Why Condo Owners & Boards Love DeclaRAY</h2>
        <div className="benefits">
          <div className="benefit"><span>✓</span> <div><strong>Instant Clarity</strong><br />AI explanations that translate legal language into everyday English.</div></div>
          <div className="benefit"><span>✓</span> <div><strong>Save Hours</strong><br />Skip the guesswork and endless scrolling through dense PDFs.</div></div>
          <div className="benefit"><span>✓</span> <div><strong>Built for Communities</strong><br />Designed specifically for condo and HOA governance structures.</div></div>
          <div className="benefit"><span>✓</span> <div><strong>Accurate Citations</strong><br />Get precise references to relevant sections of your documents.</div></div> 
          <div className="benefit"><span>✓</span> <div><strong>Private & Secure</strong><br />Your documents are processed safely — data is never shared externally.</div></div>
          <div className="benefit"><span>✓</span> <div><strong>Always Improving</strong><br />DeclaRAY evolves with your documents and community feedback.</div></div>
        </div>
      </section>


      <section>
        <h2 className="text-center">Trusted by Condo Owners and Boards</h2>
        <div className="testimonial">
          “We used to spend hours in board meetings trying to interpret our bylaws. DeclaRAY gives us answers in minutes — with the exact citations we need.”
          <strong>— Marianne H., Board President, Sunny Ridge HOA</strong>
        </div>
      </section>

      <section className="cta-final">
        <h2 className="text-center">Smarter Communities Start with Clarity</h2>
        <p>Whether you’re a first-time condo owner or a seasoned board member, DeclaRAY helps you make confident, informed decisions — without needing a law degree.</p>
        <div className="cta-buttons">
          <button className="btn-cta-primary" onClick={() => navigate('/register')}>Get Started with DeclaRAY</button>
        </div>
      </section>

      <StaticFooter />
    </>
  );
}
