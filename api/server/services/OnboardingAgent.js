const logger = require('~/config/winston');
const Candidate = require('~/models/Candidate');
const whatsapp = require('./WhatsAppIntegration');

// Fields collected via WhatsApp, mapped directly to Candidate model fields
const ONBOARDING_FIELDS = [
  'name',
  'personalEmail',
  'phone',
  'address',
  'role',
  'monthlySalary',
];

const FIELD_PROMPTS = {
  name: 'Please provide your full legal name as it appears on your ID.',
  personalEmail: 'What is your personal email address?',
  phone: 'What is your phone number? (include country code, e.g. +2348012345678)',
  address: 'What is your current residential address?',
  role: 'What is the role or position you are being onboarded for?',
  monthlySalary: 'What is your agreed monthly salary? (e.g. 500000 NGN)',
};

class OnboardingAgent {
  /**
   * Send initial greeting and update candidate status to 'onboarding'.
   * @param {Object} candidate - Mongoose Candidate document
   */
  async initiateConversation(candidate) {
    const greeting = `Hi ${candidate.name}! Welcome to the onboarding process. I'll be guiding you through a few quick questions to get you set up. Let's start: ${FIELD_PROMPTS[ONBOARDING_FIELDS[0]]}`;

    try {
      await whatsapp.sendMessage(candidate.whatsapp, greeting);
      await Candidate.findByIdAndUpdate(candidate._id, { status: 'onboarding', onboardingStep: 0 });
      logger.info(`[OnboardingAgent] Initiated conversation for candidate ${candidate._id}`);
    } catch (err) {
      logger.error(`[OnboardingAgent] Failed to initiate conversation for ${candidate._id}:`, err.message);
      await Candidate.findByIdAndUpdate(candidate._id, { status: 'pending' });
    }
  }

  /**
   * Send the next question in the onboarding sequence.
   * @param {string} candidateId
   */
  async sendNextQuestion(candidateId) {
    const candidate = await Candidate.findById(candidateId);
    if (!candidate) return;

    const field = ONBOARDING_FIELDS[candidate.onboardingStep];
    if (!field) {
      await this.completeOnboarding(candidateId);
      return;
    }

    try {
      await whatsapp.sendMessage(candidate.whatsapp, FIELD_PROMPTS[field]);
    } catch (err) {
      logger.error(`[OnboardingAgent] Failed to send question to ${candidateId}:`, err.message);
      await Candidate.findByIdAndUpdate(candidateId, { status: 'pending' });
    }
  }

  /**
   * Store a collected response and advance the conversation step.
   * @param {string} candidateId
   * @param {string} field - Key from ONBOARDING_FIELDS
   * @param {string} value - Collected value
   */
  async processResponse(candidateId, field, value) {
    // Write directly to the candidate field (not nested in onboardingData)
    await Candidate.findByIdAndUpdate(candidateId, {
      [field]: value,
      $inc: { onboardingStep: 1 },
    });

    const updated = await Candidate.findById(candidateId);
    if (updated && updated.onboardingStep >= ONBOARDING_FIELDS.length) {
      await this.completeOnboarding(candidateId);
    } else {
      await this.sendNextQuestion(candidateId);
    }
  }

  /**
   * Mark onboarding complete and set status to 'active'.
   * @param {string} candidateId
   */
  async completeOnboarding(candidateId) {
    await Candidate.findByIdAndUpdate(candidateId, { status: 'active' });
    const candidate = await Candidate.findById(candidateId);
    if (candidate) {
      try {
        await whatsapp.sendMessage(
          candidate.whatsapp,
          `Thank you ${candidate.name}! Your onboarding information has been received. Our team will be in touch with next steps. Welcome aboard! 🎉`,
        );
      } catch (err) {
        logger.error(`[OnboardingAgent] Failed to send completion message to ${candidateId}:`, err.message);
      }
    }
    logger.info(`[OnboardingAgent] Onboarding complete for candidate ${candidateId}`);
  }
}

module.exports = new OnboardingAgent();
