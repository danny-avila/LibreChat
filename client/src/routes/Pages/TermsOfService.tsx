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
        <p className="mb-4 text-sm italic">Last updated: May 22, 2025</p>

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
            Omnexio is a platform that provides users with access to a diverse range of third-party
            Large Language Models ("LLMs"), including but not limited to those developed by OpenAI,
            Anthropic, DeepSeek, Meta, Google, and Alibaba ("Third-Party AI Models"). These models
            power various agents that users may interact with for purposes such as learning, writing
            assistance, translation, programming support, summarization, entertainment, and other
            applications. Each agent is accompanied by a profile that includes a description and the
            identity of the company, developer, or individual responsible for its creation. Omnexio
            serves solely as an aggregator and interface, facilitating access to these Third-Party
            AI Models and their associated agents. Omnexio does not generate AI outputs itself and
            is not responsible for the content, services, or performance of the Third-Party AI
            Models or agents. Omnexio reserves the right, at its sole discretion, to add, remove, or
            update the Third-Party AI Models available on the platform at any time without prior
            notice.
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
              Interactions with agents on Omnexio involve artificial intelligence systems powered by
              third-party artificial intelligence models (“Third-Party AI Models”), such as those
              provided by OpenAI, Anthropic, DeepSeek, Meta, Google, or Alibaba, and not human
              operators. Where feasible, Omnexio will indicate the specific Third-Party AI Model
              used for each response or transaction in the agent’s profile or interaction interface;
            </li>
            <li>
              All responses and outputs generated by agents on Omnexio are produced by Third-Party
              AI Models. Omnexio does not control or generate these outputs and does not guarantee
              their accuracy, reliability, appropriateness, or timeliness. Information provided may
              be inaccurate, incomplete, or outdated, and you should independently verify any
              responses or advice before relying on them;
            </li>
            <li>
              Agents accessed via Omnexio should not be relied upon during emergencies. Agents may
              claim to perform actions in the real world but may not have taken any action beyond
              providing a response;
            </li>
            <li>
              Omnexio and its agents are subject to modification and may contain errors, design
              flaws, or other issues. DOTSOA OOD does not provide any warranties or guarantees
              regarding the performance, functionality, or availability of Omnexio or its agents;
            </li>
            <li>
              Use of Omnexio or its agents may result in unexpected results, loss of data,
              communications failures, or other anticipated or unanticipated damages or losses.
              Omnexio and its agents are provided on an “AS IS” basis, and access to them is not
              guaranteed;
            </li>
            <li>
              Omnexio or its agents may not operate properly, may not be in final form, or may not
              be fully functional, and DOTSOA OOD disclaims any liability for such issues.
            </li>
          </ul>

          <h3 className="mb-2 mt-4 text-lg font-medium">3.3 Restricted Uses</h3>
          <p className="mb-2">You agree not to use Omnexio or agents on Omnexio to:</p>
          <ul className="mb-4 list-disc space-y-2 pl-6">
            <li>
              Engage in activities prohibited by applicable laws, including but not limited to those
              banned under the EU AI Act, such as: <br />- Conducting biometric identification or
              categorization without explicit user consent;
              <br />- Implementing social scoring systems;
              <br />- Exploiting vulnerabilities of individuals or groups, including targeting based
              on age, disability, or socio-economic status;
              <br />- Promoting discrimination, harassment, hate speech, or any illegal activities;
            </li>
            <li>
              Use Omnexio or its agents for high-risk purposes, such as healthcare diagnostics,
              employment selection, legal advice, or other applications that may significantly
              impact individuals’ rights or well-being, unless explicitly authorized by DOTSOA OOD
              with appropriate safeguards in place;
            </li>
            <li>
              Violate the rights of any party, including intellectual property, privacy, or
              contractual rights;
            </li>
            <li>
              Reverse assemble, reverse compile, decompile, translate, or otherwise attempt to
              discover the source code, algorithms, or underlying components of Omnexio, its agents,
              or the Third-Party AI Models powering them;
            </li>
            <li>
              Abuse, harm, interfere with, reverse engineer, or disrupt Omnexio, its agents, or
              their underlying technologies, including but not limited to accessing or using them in
              fraudulent or deceptive ways, introducing malware, spamming, hacking, or bypassing
              protective measures;
            </li>
            <li>
              Use Omnexio or its agents in an automated manner that exceeds any rate limits or usage
              restrictions set by DOTSOA OOD from time to time; g. Develop products, applications,
              services, foundation models, or other large-scale models that compete with Omnexio,
              its agents, or their underlying Third-Party AI Models;
            </li>
            <li>
              Extract data from Omnexio or its agents using methods such as web scraping, web
              harvesting, or web data extraction, except as expressly permitted by these Omnexio
              Terms of Service;
            </li>
            <li>Misrepresent AI-generated content (“Bot-Generated Content”) as human-generated;</li>
            <li>
              Rely solely on AI-generated outputs for decisions with significant consequences,
              including but not limited to financial, legal, medical, or safety-related decisions.
              You are solely responsible for how you use, interpret, and act upon AI-generated
              outputs, and you must independently verify such outputs before relying on them.
            </li>
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
            Omnexio may enable you to interact with the platform by asking questions, creating
            bookmarks, voting or liking, posting, or sharing agent conversations within Omnexio or
            externally. All material you upload, publish, or display within Omnexio, including but
            not limited to your prompts, inputs, and any results or outputs generated by agents in
            response to your interactions ("Bot-Generated Content"), collectively constitute "Your
            Content."
          </p>
          <p className="mb-4">
            In accordance with the General Data Protection Regulation (GDPR) and other applicable
            data protection laws, Omnexio collects and processes Your Content solely to provide,
            maintain, and improve the platform’s functionality and services. This may include
            storing your inputs and Bot-Generated Content to facilitate your interactions, analyzing
            usage patterns to enhance user experience, and ensuring the security and integrity of
            the platform. Omnexio processes Your Content in a manner that respects your privacy
            rights and complies with all relevant legal obligations. For detailed information on the
            types of data collected, the purposes of processing, and your rights regarding your
            personal data, please refer to our{' '}
            <a className="text-blue-500" href="/pages/privacy-policy">
              Privacy Policy
            </a>
            .
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
            Omnexio's privacy practices, please visit the Omnexio{' '}
            <a className="text-blue-500" href="/pages/privacy-policy">
              Privacy Policy
            </a>
            .
          </p>

          <h2 className="mb-4 mt-6 text-xl font-medium">
            7. DISCLAIMERS AND LIMITATION OF LIABILITY
          </h2>
          <p className="mb-4">
            DOTSOA OOD DOES NOT GUARANTEE THE CONTINUOUS AVAILABILITY, FUNCTIONALITY, OR PERFORMANCE
            OF OMNEXIO, ITS AGENTS, FEATURES, OR SERVICES, NOR THE AVAILABILITY OF ANY SPECIFIC
            THIRD-PARTY AI MODELS POWERING THE AGENTS. OMNEXIO, ACTING SOLELY AS AN AGGREGATOR AND
            INTERFACE FOR THIRD-PARTY ARTIFICIAL INTELLIGENCE MODELS, MAY, AT ITS SOLE DISCRETION
            AND WITHOUT PRIOR NOTICE, ADD, REMOVE, MODIFY, OR LIMIT THE AVAILABILITY OF AGENTS,
            FEATURES, OR SERVICES. SUCH CHANGES MAY BE MADE FOR REASONS INCLUDING, BUT NOT LIMITED
            TO, RISK TO DOTSOA OOD, OMNEXIO USERS, THIRD-PARTY AI PROVIDERS, BUSINESS
            CONSIDERATIONS, OR ANY OTHER REASON DEEMED NECESSARY BY DOTSOA OOD.
          </p>
          <p className="mb-4">
            DOTSOA OOD AND ITS THIRD-PARTY AI PROVIDERS ARE NOT RESPONSIBLE FOR THE ACCURACY,
            RELIABILITY, APPROPRIATENESS, OR TIMELINESS OF ANY AI-GENERATED OUTPUTS (“BOT-GENERATED
            CONTENT”) PRODUCED BY AGENTS ON OMNEXIO. YOU ACKNOWLEDGE THAT RELIANCE ON BOT-GENERATED
            CONTENT IS AT YOUR SOLE RISK, AND DOTSOA OOD AND ITS THIRD-PARTY AI PROVIDERS DISCLAIM
            ALL LIABILITY FOR ANY DAMAGES, LOSSES, OR CONSEQUENCES ARISING FROM YOUR USE OF OR
            RELIANCE ON SUCH CONTENT, INCLUDING BUT NOT LIMITED TO FINANCIAL, LEGAL, OR PERSONAL
            HARM.
          </p>
          <p className="mb-4">
            FURTHERMORE, DOTSOA OOD DOES NOT GUARANTEE THAT YOUR USE OF OMNEXIO WILL BE ERROR-FREE,
            UNINTERRUPTED, OR FREE FROM SERVICE OUTAGES. DOTSOA OOD AND ITS THIRD-PARTY AI PROVIDERS
            ARE NOT LIABLE FOR ANY ERRORS, DISRUPTIONS, SERVICE OUTAGES, OR ANY RESULTING DAMAGES,
            WHETHER DIRECT, INDIRECT, INCIDENTAL, CONSEQUENTIAL, OR OTHERWISE, TO THE FULLEST EXTENT
            PERMITTED BY APPLICABLE LAW.
          </p>

          <h2 className="mb-4 mt-6 text-xl font-medium">8. Changes to Terms of Service</h2>
          <p className="mb-4">
            DOTSOA OOD reserves the right to modify, amend, or update these Omnexio Terms of Service
            at any time, at its sole discretion, to reflect changes in applicable laws, regulations,
            business practices, or platform operations. Such modifications will take effect
            immediately upon posting the updated Terms of Service on the Omnexio platform or as
            otherwise required by law. In the event of material changes to these Terms of Service,
            DOTSOA OOD will notify users through reasonable means, which may include posting a
            notice on the Omnexio platform, sending an email to the address associated with your
            account, or providing an in-platform notification. Your continued use of Omnexio
            following the posting or notification of updated Terms of Service constitutes your
            acceptance of such changes. It is your responsibility to review the Terms of Service
            periodically to stay informed of any updates.
          </p>
        </div>
      </div>
      <Footer />
    </>
  );
}
