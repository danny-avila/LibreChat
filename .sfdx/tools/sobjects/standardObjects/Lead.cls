// This file is generated as an Apex representation of the
//     corresponding sObject and its fields.
// This read-only file is used by the Apex Language Server to
//     provide code smartness, and is deleted each time you
//     refresh your sObject definitions.
// To edit your sObjects and their fields, edit the corresponding
//     .object-meta.xml and .field-meta.xml files.

global class Lead {
    global Id Id;
    global Boolean IsDeleted;
    global Lead MasterRecord;
    global Id MasterRecordId;
    global String LastName;
    global String FirstName;
    global String Salutation;
    global String Name;
    global String Title;
    global String Company;
    global String Street;
    global String City;
    global String State;
    global String PostalCode;
    global String Country;
    global Double Latitude;
    global Double Longitude;
    global String GeocodeAccuracy;
    global Address Address;
    global String Phone;
    global String MobilePhone;
    global String Fax;
    global String Email;
    global String Website;
    global String PhotoUrl;
    global String Description;
    global String LeadSource;
    global String Status;
    global String Industry;
    global String Rating;
    global Decimal AnnualRevenue;
    global Integer NumberOfEmployees;
    global SObject Owner;
    global Id OwnerId;
    global Boolean IsConverted;
    global Date ConvertedDate;
    global Account ConvertedAccount;
    global Id ConvertedAccountId;
    global Contact ConvertedContact;
    global Id ConvertedContactId;
    global Opportunity ConvertedOpportunity;
    global Id ConvertedOpportunityId;
    global Boolean IsUnreadByOwner;
    global Datetime CreatedDate;
    global User CreatedBy;
    global Id CreatedById;
    global Datetime LastModifiedDate;
    global User LastModifiedBy;
    global Id LastModifiedById;
    global Datetime SystemModstamp;
    global Date LastActivityDate;
    global Datetime LastViewedDate;
    global Datetime LastReferencedDate;
    global String Jigsaw;
    global String JigsawContactId;
    global String CleanStatus;
    global String CompanyDunsNumber;
    global DandBCompany DandbCompany;
    global Id DandbCompanyId;
    global String EmailBouncedReason;
    global Datetime EmailBouncedDate;
    global Individual Individual;
    global Id IndividualId;
    global List<AcceptedEventRelation> AcceptedEventRelations;
    global List<ActivityHistory> ActivityHistories;
    global List<AttachedContentDocument> AttachedContentDocuments;
    global List<Attachment> Attachments;
    global List<CampaignMember> CampaignMembers;
    global List<CollaborationGroupRecord> RecordAssociatedGroups;
    global List<CombinedAttachment> CombinedAttachments;
    global List<ContactRequest> ContactRequests;
    global List<ContentDocumentLink> ContentDocumentLinks;
    global List<DeclinedEventRelation> DeclinedEventRelations;
    global List<DuplicateRecordItem> DuplicateRecordItems;
    global List<EmailMessageRelation> EmailMessageRelations;
    global List<EmailStatus> EmailStatuses;
    global List<EntitySubscription> FeedSubscriptionsForEntity;
    global List<Event> Events;
    global List<EventRelation> EventRelations;
    global List<LeadCleanInfo> LeadCleanInfos;
    global List<LeadFeed> Feeds;
    global List<LeadHistory> Histories;
    global List<LeadShare> Shares;
    global List<ListEmailIndividualRecipient> ListEmailIndividualRecipients;
    global List<MessagingEndUser> MessagingEndUsers;
    global List<MessagingSession> MessagingSessions;
    global List<Note> Notes;
    global List<NoteAndAttachment> NotesAndAttachments;
    global List<OpenActivity> OpenActivities;
    global List<OutgoingEmailRelation> OutgoingEmailRelations;
    global List<ProcessInstance> ProcessInstances;
    global List<ProcessInstanceHistory> ProcessSteps;
    global List<RecordAction> RecordActions;
    global List<RecordActionHistory> RecordActionHistories;
    global List<ServiceAppointment> ServiceAppointments;
    global List<Task> Tasks;
    global List<TopicAssignment> TopicAssignments;
    global List<UndecidedEventRelation> UndecidedEventRelations;
    global List<UserEmailPreferredPerson> PersonRecord;
    global List<AIInsightValue> SobjectLookupValue;
    global List<AIRecordInsight> Target;
    global List<CampaignMember> LeadOrContact;
    global List<CampaignMemberChangeEvent> Lead;
    global List<ContentDistribution> RelatedRecord;
    global List<ContentDocumentLinkChangeEvent> LinkedEntity;
    global List<ContentVersion> FirstPublishLocation;
    global List<EventChangeEvent> Who;
    global List<EventRelationChangeEvent> Relation;
    global List<FeedComment> Parent;
    global List<FlowExecutionErrorEvent> ContextRecord;
    global List<FlowOrchestrationWorkItem> RelatedRecord;
    global List<OutgoingEmail> Who;
    global List<ServiceAppointmentChangeEvent> ParentRecord;
    global List<TaskChangeEvent> Who;

    global Lead () 
    {
    }
}