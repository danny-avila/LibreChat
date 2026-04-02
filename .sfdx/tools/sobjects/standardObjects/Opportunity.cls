// This file is generated as an Apex representation of the
//     corresponding sObject and its fields.
// This read-only file is used by the Apex Language Server to
//     provide code smartness, and is deleted each time you
//     refresh your sObject definitions.
// To edit your sObjects and their fields, edit the corresponding
//     .object-meta.xml and .field-meta.xml files.

global class Opportunity {
    global Id Id;
    global Boolean IsDeleted;
    global Account Account;
    global Id AccountId;
    global Boolean IsPrivate;
    global String Name;
    global String Description;
    global String StageName;
    global Decimal Amount;
    global Double Probability;
    global Decimal ExpectedRevenue;
    global Double TotalOpportunityQuantity;
    global Date CloseDate;
    global String Type;
    global String NextStep;
    global String LeadSource;
    global Boolean IsClosed;
    global Boolean IsWon;
    global String ForecastCategory;
    global String ForecastCategoryName;
    global Campaign Campaign;
    global Id CampaignId;
    global Boolean HasOpportunityLineItem;
    global Pricebook2 Pricebook2;
    global Id Pricebook2Id;
    global User Owner;
    global Id OwnerId;
    global Datetime CreatedDate;
    global User CreatedBy;
    global Id CreatedById;
    global Datetime LastModifiedDate;
    global User LastModifiedBy;
    global Id LastModifiedById;
    global Datetime SystemModstamp;
    global Date LastActivityDate;
    global Integer PushCount;
    global Datetime LastStageChangeDate;
    global Integer FiscalQuarter;
    global Integer FiscalYear;
    global String Fiscal;
    global Contact Contact;
    global Id ContactId;
    global Datetime LastViewedDate;
    global Datetime LastReferencedDate;
    global Boolean HasOpenActivity;
    global Boolean HasOverdueTask;
    global OpportunityHistory LastAmountChangedHistory;
    global Id LastAmountChangedHistoryId;
    global OpportunityHistory LastCloseDateChangedHistory;
    global Id LastCloseDateChangedHistoryId;
    global List<AccountPartner> AccountPartners;
    global List<ActivityHistory> ActivityHistories;
    global List<AttachedContentDocument> AttachedContentDocuments;
    global List<Attachment> Attachments;
    global List<CollaborationGroupRecord> RecordAssociatedGroups;
    global List<CombinedAttachment> CombinedAttachments;
    global List<ContactRequest> ContactRequests;
    global List<ContentDocumentLink> ContentDocumentLinks;
    global List<EmailMessage> Emails;
    global List<EntitySubscription> FeedSubscriptionsForEntity;
    global List<Event> Events;
    global List<MessagingSession> MessagingSessions;
    global List<Note> Notes;
    global List<NoteAndAttachment> NotesAndAttachments;
    global List<OpenActivity> OpenActivities;
    global List<OpportunityCompetitor> OpportunityCompetitors;
    global List<OpportunityContactRole> OpportunityContactRoles;
    global List<OpportunityFeed> Feeds;
    global List<OpportunityFieldHistory> Histories;
    global List<OpportunityHistory> OpportunityHistories;
    global List<OpportunityLineItem> OpportunityLineItems;
    global List<OpportunityPartner> OpportunityPartnersFrom;
    global List<OpportunityShare> Shares;
    global List<Partner> Partners;
    global List<ProcessInstance> ProcessInstances;
    global List<ProcessInstanceHistory> ProcessSteps;
    global List<RecordAction> RecordActions;
    global List<RecordActionHistory> RecordActionHistories;
    global List<ServiceAppointment> ServiceAppointments;
    global List<Swarm> Swarms;
    global List<SwarmMember> SwarmMembers;
    global List<Task> Tasks;
    global List<TopicAssignment> TopicAssignments;
    global List<AIInsightValue> SobjectLookupValue;
    global List<AIRecordInsight> Target;
    global List<ContentDistribution> RelatedRecord;
    global List<ContentDocumentLinkChangeEvent> LinkedEntity;
    global List<ContentVersion> FirstPublishLocation;
    global List<EmailMessageChangeEvent> RelatedTo;
    global List<EventChangeEvent> What;
    global List<EventRelationChangeEvent> Relation;
    global List<FeedComment> Parent;
    global List<FlowExecutionErrorEvent> ContextRecord;
    global List<FlowOrchestrationWorkItem> RelatedRecord;
    global List<Lead> ConvertedOpportunity;
    global List<OpportunityContactRoleChangeEvent> Opportunity;
    global List<OutgoingEmail> RelatedTo;
    global List<ServiceAppointmentChangeEvent> ParentRecord;
    global List<TaskChangeEvent> What;

    global Opportunity () 
    {
    }
}