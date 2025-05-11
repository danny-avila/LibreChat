import React from 'react';
import Footer from '~/routes/Pages/Footer';

/**
 * Component for displaying the Privacy Policy page
 * @returns Privacy Policy React component
 */
export default function PrivacyPolicy() {
  return (
    <>
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-6 text-3xl font-semibold">Omnexio Privacy Policy</h1>
        <p className="mb-4 text-sm italic">Last updated: May 11, 2025</p>

        <div className="dark:prose-invert">
          <p className="mb-4">
            This Omnexio Privacy Policy ("Privacy Policy") describes how your personal information
            is processed when you use Omnexio, a platform that lets you communicate with bots
            powered by third-party AI model providers. This Privacy Policy applies to activities by
            Omnexio, and its affiliates and subsidiaries (collectively "Omnexio," "we" or "us").
            This Omnexio Privacy Policy supplements the Omnexio Privacy Policy, which is
            incorporated by reference. Omnexio is the data controller of your personal information
            and is responsible for providing you with this Privacy Policy.
          </p>

          <h2 className="mb-4 mt-6 text-xl font-medium">
            Information We Collect, How It Is Used, & The Legal Basis for Processing
          </h2>
          <ul className="mb-4 list-disc space-y-3 pl-6">
            <li>
              <span className="font-medium">Account Information.</span> We collect your email
              address and phone number to create an account and verify your identity. We also create
              a user ID for your Omnexio account. If you are an existing Omnexio user, your name,
              Omnexio-associated email address, profile photo, and Omnexio user ID will be used to
              link your Omnexio account to your Omnexio account. Depending on your location, we may
              also ask you to provide your date of birth to verify your age. We use this information
              to communicate with you, troubleshoot issues, and provide updates on the latest
              Omnexio features. This processing is necessary to comply with our legal and
              contractual obligations to you.
            </li>
            <li>
              <span className="font-medium">Contact List.</span> With your consent, Omnexio may
              access and periodically sync your phone's contact list to make it easy for you to find
              and connect with your friends on Omnexio. It is in our legitimate business interests
              to provide you with a customized experience.
            </li>
            <li>
              <span className="font-medium">Device Information.</span> We collect your device type
              and operating system details for analytics and to troubleshoot product issues. This is
              so we can comply with our contractual obligations to you.
            </li>
            <li>
              <span className="font-medium">Third Party Application Login.</span> You can log into
              your Omnexio account using third-party applications (e.g., Google and Apple). When you
              log in using this method, we collect your name and email address associated with that
              third-party application for authentication and identity verification purposes. This
              processing is necessary to comply with our contractual obligations to you.
            </li>
            <li>
              <span className="font-medium">Subscription Billing Data.</span> We use a third-party
              service provider to collect and process your billing information when you subscribe to
              Omnexio. The information our billing provider collects may include your name, billing
              address, your credit or debit card details, phone number, and email address. This
              processing is necessary to comply with our contractual obligations to you.
            </li>
            <li>
              <span className="font-medium">Content Creator Payments.</span> If you are a content
              creator on Omnexio, we collect and share your email with our third-party payment
              processor to help facilitate payments to you. We also collect and share your tax
              information, such as your tax ID and address, with our tax service provider. This
              processing is necessary to comply with our legal and contractual obligations to you.
            </li>
            <li>
              <span className="font-medium">Advertising.</span> We collect information about you
              when you interact with Omnexio ads to measure the effectiveness of our ad campaigns.
              This information includes your IP address, advertising ID, and ad interaction
              information. We share your hashed email with our ad platform partners for our paid
              acquisition campaigns. It is in our legitimate business interest to advertise our
              platform. Where necessary, we will obtain your consent before engaging in this
              processing.
            </li>
            <li>
              <span className="font-medium">User Research.</span> We may ask you to help us test new
              features or participate in surveys to help enhance your Omnexio experience. Your
              participation is voluntary, and the data we collect is anonymized. With your consent,
              we may use your personal information to communicate with you. It is in our legitimate
              business interest to improve our platform.
            </li>
            <li>
              <span className="font-medium">Interactions with Bots on Omnexio.</span> Our
              third-party AI model LLM providers and third-party bot developers may receive details
              about your interactions with bots on Omnexio (including the contents of your chats) to
              provide and generally improve their services, which they may process in their
              legitimate business interests. Your Omnexio user account information (e.g., username
              and email) is not shared with our third-party AI model providers or developers.
              Third-party developers that create bots on Omnexio using APIs may view and store your
              anonymized chats on their servers to train their models. We may use your interactions
              on Omnexio to provide you a personalized experience, such as recommending other bots
              to explore or topics to discuss.
            </li>
          </ul>

          <p className="mb-4">
            Keep in mind, any information and files you provide to the bots on Omnexio will be
            shared with third-party AI model providers and developers powering the bots, and there
            is no need to share sensitive personal information with the bots (e.g., credit card
            information, social security information, etc.). For more information about the
            third-party AI model providers and bot developers, please see the respective bot
            profiles and visit the Omnexio Privacy Center.
          </p>

          <p className="mb-4">
            For more information about our privacy and data protection practices, including how to
            exercise your privacy rights, please visit the Omnexio Privacy Policy.
          </p>

          <h2 className="mb-4 mt-6 text-xl font-medium">Contact Us</h2>
          <p className="mb-4">
            Please contact our Data Protection Officer at admin@omnexio.ai if you have questions
            about this Privacy Policy. For more information about our privacy and data protection
            practices, including how to exercise your privacy rights, please visit the Omnexio
            Privacy Policy.
          </p>
        </div>
      </div>
      <Footer />
    </>
  );
}
