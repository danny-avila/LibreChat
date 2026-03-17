const mongoose = require('mongoose');

const candidateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    whatsapp: { type: String, required: true },
    role: { type: String, default: '' },
    status: {
      type: String,
      enum: ['pending', 'onboarding', 'active'],
      default: 'pending',
    },
    // Contact
    companyEmail: { type: String, default: '' },
    personalEmail: { type: String, default: '' },
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
    // Personality & Notes
    notes: { type: String, default: '' },
    // Role & Skills
    descriptionGoals: { type: String, default: '' },
    skills: [{ type: String }],
    // Financial
    monthlySalary: { type: String, default: '' },
    currency: { type: String, default: 'USD' },
    // Documents (store file URLs or keys)
    documents: {
      idCard: { type: String, default: '' },
      passport: { type: String, default: '' },
      employmentContract: { type: String, default: '' },
    },
    // Social Media
    socialMedia: {
      linkedin: { type: String, default: '' },
      instagram: { type: String, default: '' },
      twitter: { type: String, default: '' },
      facebook: { type: String, default: '' },
      telegram: { type: String, default: '' },
      website: { type: String, default: '' },
    },
    googleDriveFolder: { type: String, default: '' },
    // Onboarding
    onboardingData: {
      fullLegalName: String,
      dateOfBirth: String,
      emergencyContact: String,
      roleStartDate: String,
    },
    onboardingStep: { type: Number, default: 0 },
  },
  { timestamps: true },
);

module.exports = mongoose.model('Candidate', candidateSchema);
