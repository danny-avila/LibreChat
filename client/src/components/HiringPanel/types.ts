export type OnboardingStatus = 'pending' | 'onboarding' | 'active';
export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';

export interface Candidate {
  _id: string;
  name: string;
  whatsapp: string;
  role: string;
  status: OnboardingStatus;
  // Contact
  companyEmail?: string;
  personalEmail?: string;
  phone?: string;
  address?: string;
  // Personality & Notes
  notes?: string;
  // Role & Skills
  descriptionGoals?: string;
  skills?: string[];
  // Financial
  monthlySalary?: string;
  currency?: string;
  // Documents
  documents?: {
    idCard?: string;
    passport?: string;
    employmentContract?: string;
  };
  // Social Media
  socialMedia?: {
    linkedin?: string;
    instagram?: string;
    twitter?: string;
    facebook?: string;
    telegram?: string;
    website?: string;
  };
  googleDriveFolder?: string;
  onboardingData?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  _id: string;
  title: string;
  description: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AddCandidateInput {
  name: string;
  whatsapp: string;
  role?: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
}
