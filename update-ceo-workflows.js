const mongoose = require('mongoose');
const Profile = require('./api/server/models/Profile');

mongoose.connect('mongodb://127.0.0.1:27017/LibreChat').then(async () => {
  try {
    const profile = await Profile.findOne({ profileType: 'ceo' });
    
    if (!profile) {
      console.log('❌ CEO profile not found');
      process.exit(1);
    }

    console.log('📋 Current workflows:', profile.allowedWorkflows.length);

    // Update to only analytics workflows
    profile.allowedWorkflows = [
      { 
        workflowId: 'wf_financial_analytics', 
        workflowName: 'Financial Analytics', 
        endpoint: '/webhook/librechat/financial-analytics', 
        description: 'View revenue, expenses, and profit margins' 
      },
      { 
        workflowId: 'wf_company_metrics', 
        workflowName: 'Company Metrics', 
        endpoint: '/webhook/librechat/company-metrics', 
        description: 'Employee count, active projects, satisfaction scores' 
      }
    ];

    await profile.save();
    console.log('✅ CEO profile updated successfully');
    console.log('📋 New workflows:', profile.allowedWorkflows.length);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
});
