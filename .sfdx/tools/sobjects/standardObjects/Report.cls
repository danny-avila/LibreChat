// This file is generated as an Apex representation of the
//     corresponding sObject and its fields.
// This read-only file is used by the Apex Language Server to
//     provide code smartness, and is deleted each time you
//     refresh your sObject definitions.
// To edit your sObjects and their fields, edit the corresponding
//     .object-meta.xml and .field-meta.xml files.

global class Report {
    global Id Id;
    global SObject Owner;
    global Id OwnerId;
    global String FolderName;
    global Datetime CreatedDate;
    global User CreatedBy;
    global Id CreatedById;
    global Datetime LastModifiedDate;
    global User LastModifiedBy;
    global Id LastModifiedById;
    global Boolean IsDeleted;
    global String Name;
    global String Description;
    global String DeveloperName;
    global String NamespacePrefix;
    global Datetime LastRunDate;
    global Datetime SystemModstamp;
    global String Format;
    global Datetime LastViewedDate;
    global Datetime LastReferencedDate;
    global List<AttachedContentDocument> AttachedContentDocuments;
    global List<CombinedAttachment> CombinedAttachments;
    global List<ContentDocumentLink> ContentDocumentLinks;
    global List<EntitySubscription> FeedSubscriptionsForEntity;
    global List<ReportFeed> Feeds;
    global List<ScorecardMetric> ScorecardMetrics;
    global List<ContentDocumentLinkChangeEvent> LinkedEntity;
    global List<ContentVersion> FirstPublishLocation;
    global List<DashboardComponent> CustomReport;
    global List<FeedComment> Parent;
    global List<FlowExecutionErrorEvent> ContextRecord;
    global List<FlowRecordRelation> RelatedRecord;
    global List<ReportEvent> Report;

    global Report () 
    {
    }
}