import React from 'react';
import Footer from '~/routes/Pages/Footer';

/**
 * Component for displaying the Terms of Service page
 * @returns Terms of Service React component
 */
export default function TermsOfService() {
  return (
    <>
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-6 text-3xl font-semibold">Omnexio Terms of Service</h1>
        <p className="mb-4 text-sm italic">Last updated: May 11, 2025</p>

        <div className="dark:prose-invert">
          <p className="mb-4">
            These Omnexio Terms of Service ("Terms") are an agreement entered between you and DOTSOA
            OOD and its affiliates (collectively "DOTSOA OOD," "we," or "us") in connection with
            your use of the Omnexio service ("Omnexio"). In these Terms, "you" refers both to you as
            an individual and to the entity you represent. By using Omnexio, you consent to these
            Omnexio Terms of Service.
          </p>

          <p className="mb-4 font-bold">
            IMPORTANT! PLEASE READ THIS DOCUMENT CAREFULLY. THIS DOCUMENT WILL BECOME LEGALLY
            BINDING UPON MARKING THE "ACCEPT TERMS AND CONDITIONS" BY SUBSCRIBING. IF YOU DO NOT
            UNDERSTAND ANY PART OF THIS DOCUMENT, PLEASE CONTACT US.
          </p>

          <h2 className="mb-4 mt-6 text-xl font-medium">ABOUT US</h2>
          <p className="mb-4">
            DOTSOA OOD is a company organized under the laws of Bulgaria, with legal entity number
            201700413, and a registered office at Tsarigradsko Shose Blvd No. 115M, European Trade
            Center, Building D, Floor 1, Sofia, Bulgaria (referred to in this document as "Company,"
            "we," or "us").
          </p>

          <h2 className="mb-4 mt-6 text-xl font-medium">
            1. A Platform for Open Exploration (Omnexio)
          </h2>
          <p className="mb-4">
            Omnexio is a platform that enables you to explore and interact with various agents
            powered by third-party Large Language Models ("LLMs") and developers, including OpenAI
            and Anthropic. Omnexio may also allow you to create your own agents powered by these
            third-party LLMs. You can use Bots for a variety of purposes, from learning, writing
            help, translation, programming help, summarization, entertainment, to many other things.
            Each agent has its own description in its profile and the name of the company,
            developer, or individual who created the bot. Omnexio is a platform that enables users
            to access various third-party agents, but Omnexio does not provide and is not
            responsible for the content or services available from these agents.
          </p>

          <h2 className="mb-4 mt-6 text-xl font-medium">2. Age Requirements</h2>
          <p className="mb-4">
            Use of Omnexio by anyone under 13 years of age is prohibited. You represent that you are
            at least the age of majority in the jurisdiction where you live or, if you are not, your
            parent or legal guardian must consent to these Omnexio Terms of Service and affirm that
            they accept these Terms on your behalf and bear responsibility for your use. Bots
            accessed via Omnexio may produce content that is not suitable for minors. If you are
            accepting these Omnexio Terms of Service on behalf of someone else or an entity, you
            confirm that you have the legal authority to bind that person or entity to these Terms.
          </p>

          <h2 className="mb-4 mt-6 text-xl font-medium">3. Your Use of Omnexio</h2>

          <h3 className="mb-2 mt-4 text-lg font-medium">3.1 Use of Omnexio</h3>
          <p className="mb-4">
            Subject to your compliance with these Terms, we grant you a personal, non-exclusive,
            non-transferable right to use Omnexio and its agents.
          </p>

          <h3 className="mb-2 mt-4 text-lg font-medium">3.2 User Acknowledgments</h3>
          <p className="mb-2">You acknowledge and agree that:</p>
          <ul className="mb-4 list-disc space-y-2 pl-6">
            <li>
              Bots accessed via Omnexio should not be relied upon during emergencies; agents may
              claim to perform actions for you in the real world but may have not taken any action
              besides responding to you;
            </li>
            <li>
              Bots accessed via Omnexio may not generate accurate information and information
              provided may be out of date. You should independently verify responses or advice
              provided by any agents on Omnexio. DOTSOA OOD does not provide any warranties or
              guarantees as to the accuracy of any information provided via Omnexio;
            </li>
            <li>
              Omnexio and agents on Omnexio are subject to modification and alteration, and may
              contain errors, design flaws, or other issues;
            </li>
            <li>
              Use of Omnexio or agents on Omnexio may result in unexpected results, loss of data or
              communications, or other anticipated or unanticipated damage or loss to you;
            </li>
            <li>
              Omnexio or agents on Omnexio may not operate properly, be in final form, or be fully
              functional; your access to Omnexio or the agents is not guaranteed and Omnexio and the
              agents are provided on an AS IS basis.
            </li>
          </ul>

          <h3 className="mb-2 mt-4 text-lg font-medium">3.3 Restricted Uses</h3>
          <p className="mb-2">You agree not to use Omnexio or agents on Omnexio to:</p>
          <ul className="mb-4 list-disc space-y-2 pl-6">
            <li>Violate the rights of another party or any applicable laws;</li>
            <li>
              Reverse assemble, reverse compile, decompile, translate or otherwise attempt to
              discover the source code or underlying components of models, algorithms, and systems
              of Omnexio, the agents, or their underlying technologies;
            </li>
            <li>
              Abuse, harm, interfere with, reverse engineer, or disrupt Omnexio, the agents, or
              their underlying technologies, such as by accessing or using them in fraudulent or
              deceptive ways, introducing malware, or spamming, hacking, or bypassing any protective
              measures;
            </li>
            <li>
              Use Omnexio or the agents in an automated fashion, such as by exceeding any rate
              limits set forth by us from time to time;
            </li>
            <li>
              Use Omnexio or the agents to develop products, applications, services, foundation
              models or other large scale models that compete with Omnexio, the agents, and their
              underlying technologies;
            </li>
            <li>
              Use any method to extract data from Omnexio or the agents, including web scraping, web
              harvesting, or web data extraction methods, other than as permitted by these Omnexio
              Terms of Service; or
            </li>
            <li>Represent that Bot-Generated Content (as defined below) is human-generated.</li>
          </ul>

          <h3 className="mb-2 mt-4 text-lg font-medium">3.4 Feedback</h3>
          <p className="mb-4">
            We welcome your feedback and suggestions about how to improve Omnexio or agents on
            Omnexio. By submitting feedback, you agree to grant us the right, at our discretion, to
            use, copy, disclose, create derivative works, display, publish, and otherwise exploit
            the feedback, in whole or part, freely and without any compensation to you. Please
            provide your feedback by emailing us at support@omnexio.com.
          </p>

          <h2 className="mb-4 mt-6 text-xl font-medium">4. Your Content</h2>

          <h3 className="mb-2 mt-4 text-lg font-medium">4.1 Your Content</h3>
          <p className="mb-4">
            Omnexio may allow you to ask questions, create bookmarks, vote or like, post, or share
            agent conversations within Omnexio or outside of Omnexio. All material that you upload,
            publish, or display within Omnexio, and any results that you receive in response to your
            prompts (or other inputs) from agents accessible via Omnexio ("Bot-Generated Content"),
            will collectively be considered "Your Content."
          </p>
          <p className="mb-4">
            Other users may ask questions and receive responses from agents on Omnexio that are
            similar to or the same as yours. The content that other users receive are not considered
            Your Content.
          </p>

          <h3 className="mb-2 mt-4 text-lg font-medium">4.2 Ownership</h3>
          <p className="mb-4">
            You retain ownership of Your Content, subject to the non-exclusive rights granted below.
          </p>

          <h3 className="mb-2 mt-4 text-lg font-medium">4.3 Your Responsibility</h3>
          <p className="mb-4">
            You acknowledge and agree agents accessible via Omnexio answer your questions based on
            knowledge derived from a variety of sources, and that DOTSOA OOD does not create or
            generate any Bot-Generated Content. Omnexio provides access to several underlying
            technologies, including third-party providers that use LLMs. An LLM is a machine
            learning system that processes and generates text. You agree that you are responsible
            for Your Content and Your Bots, including for ensuring that they do not violate any
            applicable law, these Terms (including the Restricted Uses in Section 3.3 above), our
            policies, or the policies of any third-party LLMs which power agents within Omnexio.
          </p>
          <p className="mb-4">
            We reserve the right to block, remove, and/or permanently delete Your Content or Your
            Bots if they are in breach of these Terms, our policies, the policies of any third-party
            LLMs which power agents within Omnexio, or violate any applicable law or regulation, or
            if it creates risk for DOTSOA OOD or Omnexio or negatively impacts the experience of
            other Omnexio users.
          </p>

          <h3 className="mb-2 mt-4 text-lg font-medium">4.4 Our Use of Your Content</h3>
          <p className="mb-2">
            We may use Your Content and Your Bots to provide and improve Omnexio, including:
          </p>
          <ul className="mb-4 list-disc space-y-2 pl-6">
            <li>Providing your questions and prompts to third-party LLMs to generate responses</li>
            <li>Displaying Your Content to others if you use the sharing features in Omnexio</li>
            <li>Making available Your Bots for others to use and interact with within Omnexio</li>
            <li>Promoting your shared content or Your Bots to others</li>
            <li>Understanding your use of Omnexio to generally improve the Omnexio services</li>
          </ul>
          <p className="mb-4">
            We may also need to use or disclose Your Content to comply with applicable laws, enforce
            these Omnexio Terms of Service and our policies, and to detect and prevent fraud,
            security, or technical issues.
          </p>
          <p className="mb-4">
            By using Omnexio, you grant us a worldwide, non-exclusive, royalty-free, transferable,
            and perpetual license to use Your Content and Your Bots as stated above.
          </p>

          <h2 className="mb-4 mt-6 text-xl font-medium">5. Termination</h2>
          <p className="mb-4">
            You may cease your use of Omnexio or terminate these Omnexio Terms of Service at any
            time for any reason or no reason by deleting your account in your settings. We may
            terminate your access to Omnexio and/or these Omnexio Terms of Service at any time for
            any reason or no reason. Any Data collected prior to termination may continue to be used
            in accordance with these Terms. The following provisions will survive expiration or
            termination of these Terms, in addition to the provisions set forth in Section 11(e) of
            the DOTSOA OOD Platform Terms of Service: Section 3.4 (Feedback), Section 4.3, 4.4 and
            4.5 (Your Content), this Section 5 (Termination), Section 7 (Disclaimers and Limitation
            of Liability) and Section 8 (General).
          </p>

          <h2 className="mb-4 mt-6 text-xl font-medium">6. Privacy</h2>
          <p className="mb-4">
            As detailed in the Omnexio Privacy Policy, we may collect certain personal information
            related to your use of Omnexio (including contact information, etc.). Your account
            information is anonymized before being shared with third-party LLM providers and
            developers. The third-party developers and LLM providers may receive details about your
            interactions with agents on Omnexio (including the contents of your chats, upvotes,
            etc.) to provide responses and to generally improve the services. There is no need to
            share sensitive personal information with the agents (such as credit card information,
            social security information, etc.). For more information about the third-party LLM
            providers, please see the respective agent profiles. For more information about
            Omnexio's privacy practices, please visit the Omnexio Privacy Policy.
          </p>

          <h2 className="mb-4 mt-6 text-xl font-medium">
            7. DISCLAIMERS AND LIMITATION OF LIABILITY
          </h2>
          <p className="mb-4">
            WE CANNOT GUARANTEE THE AVAILABILITY OF ANY AGENTS , FEATURES OR SERVICE OF OMNEXIO OR
            AVAILABLE THROUGH OMNEXIO. WHILE WE ARE CONTINUING TO DEVELOP NEW FEATURES, ADD AGENTS
            AND IMPROVE OMNEXIO, WE MAY, WITHOUT NOTICE TO YOU, ADD OR REMOVE FEATURES OR AGENTS ,
            LIMIT USE OR AVAILABILITY OF FEATURES OR AGENTS ENTIRELY (OR JUST IN CERTAIN PLACES OR
            FOR SOME USERS) IF THEY CREATE RISK TO DOTSOA OOD, USERS OF OMNEXIO, THIRD PARTIES
            POWERING THE AGENTS , NO LONGER MAKE SENSE FROM A BUSINESS PERSPECTIVE OR FOR ANY REASON
            IN OUR SOLE DISCRETION. WE ALSO CANNOT GUARANTEE THAT YOUR USE OF OMNEXIO WILL BE ERROR
            FREE, DISRUPTED OR THAT YOU WILL NOT EXPERIENCE SERVICE OUTAGES. WE ARE NOT LIABLE FOR
            ANY ERRORS, DISRUPTIONS OR SERVICE OUTAGES THAT MAY OCCUR.
          </p>
        </div>
      </div>
      <Footer />
    </>
  );
}
