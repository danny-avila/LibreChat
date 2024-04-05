const welcomeEmail = (userName) => {
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to ChatG!</title>
  </head>
  <body style="font-family: Arial, sans-serif;">
  
    <!-- Container table -->
    <table width="100%" border="0" cellspacing="0" cellpadding="0">
      <tr>
        <td align="center">
  
          <!-- Logo -->
          <img src="https://chatg.com/logo.png" alt="ChatG Logo" style="max-width: 200px; margin-bottom: 20px;">
  
          <!-- Content -->
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px;">
            <tr>
              <td style="padding: 20px; background-color: #f9f9f9; border-radius: 10px;">
                <h1>Welcome to ChatG!</h1>
                <p>Hello ${userName},</p>
                <p>Welcome to ChatG! 🎉 We're thrilled to have you on board and can't wait to see what amazing things we'll create together.</p>
                <h2>Quick Tips to Get Started:</h2>
                <ol>
                  <li><strong>Explore:</strong> Dive into our platform and discover the myriad of ways you can use ChatG to enhance your projects, spark creativity, and streamline your workflow.</li>
                  <li><strong>Experiment:</strong> Don't be afraid to experiment! Whether you're crafting compelling content, generating innovative ideas, or seeking assistance with tasks, ChatG is here to help you unleash your potential.</li>
                  <li><strong>Engage:</strong> Join our community of creators, innovators, and problem-solvers. Share your experiences, exchange tips and tricks, and connect with like-minded individuals who are passionate about leveraging AI to make a difference.</li>
                  <li><strong>Feedback:</strong> We're continuously striving to improve and evolve. Your feedback is invaluable to us, so please don't hesitate to share your thoughts, suggestions, and ideas with us. Together, we can shape the future of AI-powered creativity.</li>
                </ol>
                <p>If you have any questions or need assistance, don't hesitate to reach out to our support team at <a href="mailto:support@chatg.com">support@chatg.com</a>. We're here to help!</p>
                <p>Once again, welcome to the ChatG family. We're excited to embark on this journey with you.</p>
                <p>Best regards,<br>The ChatG Team</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>`;
};

const subscribeEmail = (username, renewalDate) => {
  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>
        Welcome to ChatG Premium! Get Ready to Unlock Exclusive Bots and Features
        🚀
      </title>
      <style>
        /* Add your custom styles here */
        body {
          font-family: Arial, sans-serif;
          background-color: #f4f4f4;
          margin: 0;
          padding: 0;
        }
        .container {
          max-width: 600px;
          margin: 20px auto;
          background-color: #fff;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        }
        .header {
          background-color: #4caf50;
          color: #fff;
          padding: 10px 20px;
          border-top-left-radius: 8px;
          border-top-right-radius: 8px;
        }
        .content {
          padding: 20px;
        }
        .button {
          display: inline-block;
          background-color: #4caf50;
          color: #fff;
          text-decoration: none;
          padding: 10px 20px;
          border-radius: 5px;
          margin-top: 20px;
        }
        .button:hover {
          background-color: #45a049;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>Welcome to the club!</h2>
        </div>
        <div class="content">
          <p>Dear ${username},</p>
          <p>
            Welcome to the Premium Plan on ChatG! You are now part of an exclusive
            community with access to advanced bots and enhanced features.
          </p>
          <p>As a Premium member, you'll enjoy:</p>
          <ul>
            <li>
              Access to exclusive bots, including GPT-4, Claude-3-Opus, and more.
            </li>
            <li>Faster responses with bots.</li>
            <li>10,000 monthly credits to use across our platform.</li>
            <li>Your membership will renew on ${renewalDate}.</li>
          </ul>
          <p>
            We're thrilled to have you on board and look forward to providing you
            with an exceptional experience!
          </p>
          <p>
            Best regards,<br />
            The ChatG Team
          </p>
          <a href="https://chatg.com" class="button" style="color:white">Get Started</a>
        </div>
      </div>
    </body>
  </html>
  `;
};

const unSubscribeEmail = (subscriber, renewalDate) => {
  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>ChatG Premium Cancellation Confirmation</title>
    </head>
    <body>
      <p>Dear ${subscriber},</p>
  
      <p>
        We've received your recent request to unsubscribe from our ChatG Premium
        service, and we want to confirm that your subscription will end on
        ${renewalDate}. While we respect your decision, we want to remind
        you of the incredible features you'll be missing out on. Here's a quick
        recap:
      </p>
  
      <ol>
        <li>
          <strong>Access to Cutting-Edge AI Models:</strong> Enjoy exclusive
          access to GPT-4 and Claude-3-Opus, our latest and most advanced AI
          models, providing you with unparalleled conversational experiences.
        </li>
        <li>
          <strong>Crypto Tips:</strong> Accept crypto tips from the vibrant ChatG
          Community and engage in meaningful discussions with fellow enthusiasts.
        </li>
        <li>
          <strong>Customized Experience with Credits:</strong> Use your 2000
          monthly credits to personalize your AI chat experience, accessing the
          bots you want when you want them.
        </li>
        <li>
          <strong>Faster speed with Popular Bots:</strong> Benefit from faster
          responses when engaging with premium bots equipped with enhanced
          understanding and wider knowledge.
        </li>
        <li>
          <strong>Early Access to Innovation:</strong> Be among the first to
          explore and experience new features, including experimental bots like
          ChatGPT-16k and GPT-4-32k, shaping the future of AI chat interactions.
        </li>
      </ol>
  
      <p>
        We understand that circumstances change, and we're here to welcome you
        back with open arms. If you'd like to reactivate your subscription and
        regain access to these fantastic features, simply click the link below:
      </p>
  
      <p>
        <a
          href="https://app.chatg.com/c/new?settings=open&tab=account"
          style="
            text-decoration: none;
            background-color: #007bff;
            color: #ffffff;
            padding: 10px 20px;
            border-radius: 5px;
          "
          >Re-activate Now</a
        >
      </p>
  
      <p>
        If you have any questions or need assistance, feel free to reach out to
        our support team. We're always here to help.
      </p>
  
      <p>
        Thank you for considering rejoining our ChatG Premium community. We look
        forward to having you back!
      </p>
  
      <p>
        Best regards,<br />
        The ChatG Team<br />
      </p>
    </body>
  </html>
  `;
};

const topupSubscribeEmail = (subscriber, balance) => {
  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Credit Top-Up Confirmation</title>
    </head>
    <body>
      <p>Dear ${subscriber},</p>
  
      <p>
        We're writing to confirm that your credit top-up on ChatG was successful.
        You've added credits to your account as per your purchase.
      </p>
  
      <p>
        As part of your purchase, your account has been credited with an
        additional 1000 ChatG credits.
      </p>
  
      <p>Your current credit balance: ${balance}</p>
  
      <p>
        Your topped-up credits will allow you to enjoy extended use of our premium
        bots.
      </p>
  
      <p>
        If you have any questions or need assistance, feel free to reach out to
        our support team. We're here to help.
      </p>
  
      <p>Thank you for choosing ChatG for your AI Chat needs!</p>
  
      <p>
        Best regards,<br />
        The ChatG Team
      </p>
    </body>
  </html>
  `;
};

module.exports = {
  welcomeEmail,
  subscribeEmail,
  unSubscribeEmail,
  topupSubscribeEmail,
};
