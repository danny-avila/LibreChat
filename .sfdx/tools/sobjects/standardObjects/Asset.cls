// This file is generated as an Apex representation of the
//     corresponding sObject and its fields.
// This read-only file is used by the Apex Language Server to
//     provide code smartness, and is deleted each time you
//     refresh your sObject definitions.
// To edit your sObjects and their fields, edit the corresponding
//     .object-meta.xml and .field-meta.xml files.

global class Asset {
    global Id Id;
    global Contact Contact;
    global Id ContactId;
    global Account Account;
    global Id AccountId;
    global Asset Parent;
    global Id ParentId;
    global Asset RootAsset;
    global Id RootAssetId;
    global Product2 Product2;
    global Id Product2Id;
    global String ProductCode;
    global Boolean IsCompetitorProduct;
    global Datetime CreatedDate;
    global User CreatedBy;
    global Id CreatedById;
    global Datetime LastModifiedDate;
    global User LastModifiedBy;
    global Id LastModifiedById;
    global Datetime SystemModstamp;
    global Boolean IsDeleted;
    global String Name;
    global String SerialNumber;
    global Date InstallDate;
    global Date PurchaseDate;
    global Date UsageEndDate;
    global Datetime LifecycleStartDate;
    global Datetime LifecycleEndDate;
    global String Status;
    global Decimal Price;
    global Double Quantity;
    global String Description;
    global User Owner;
    global Id OwnerId;
    global Location Location;
    global Id LocationId;
    global Account AssetProvidedBy;
    global Id AssetProvidedById;
    global Account AssetServicedBy;
    global Id AssetServicedById;
    global Boolean IsInternal;
    global Integer AssetLevel;
    global String StockKeepingUnit;
    global Boolean HasLifecycleManagement;
    global Decimal CurrentMrr;
    global Datetime CurrentLifecycleEndDate;
    global Double CurrentQuantity;
    global Decimal CurrentAmount;
    global Decimal TotalLifecycleAmount;
    global String Street;
    global String City;
    global String State;
    global String PostalCode;
    global String Country;
    global Double Latitude;
    global Double Longitude;
    global String GeocodeAccuracy;
    global Address Address;
    global Datetime LastViewedDate;
    global Datetime LastReferencedDate;
    global List<ActivityHistory> ActivityHistories;
    global List<Asset> ChildAssets;
    global List<AssetAction> AssetActions;
    global List<AssetAttribute> AssetAttributes;
    global List<AssetDowntimePeriod> AssetDowntimePeriods;
    global List<AssetFeed> Feeds;
    global List<AssetHistory> Histories;
    global List<AssetRelationship> PrimaryAssets;
    global List<AssetRelationship> RelatedAssets;
    global List<AssetShare> Shares;
    global List<AssetStatePeriod> AssetStatePeriods;
    global List<AssetWarranty> WarrantyAssets;
    global List<AttachedContentDocument> AttachedContentDocuments;
    global List<Attachment> Attachments;
    global List<Case> Cases;
    global List<CombinedAttachment> CombinedAttachments;
    global List<ContentDocumentLink> ContentDocumentLinks;
    global List<ContractLineItem> ContractLineItems;
    global List<EmailMessage> Emails;
    global List<Entitlement> Entitlements;
    global List<EntitySubscription> FeedSubscriptionsForEntity;
    global List<Event> Events;
    global List<MaintenanceAsset> MaintenanceAssets;
    global List<Note> Notes;
    global List<NoteAndAttachment> NotesAndAttachments;
    global List<OpenActivity> OpenActivities;
    global List<ProcessInstance> ProcessInstances;
    global List<ProcessInstanceHistory> ProcessSteps;
    global List<ProductServiceCampaignItem> ProductServiceCampaignItems;
    global List<RecordAction> RecordActions;
    global List<RecordActionHistory> RecordActionHistories;
    global List<RecordsetFltrCritMonitor> RecordsetFltrCritMonitors;
    global List<ResourcePreference> ResourcePreferences;
    global List<ReturnOrderLineItem> ReturnOrderLineItems;
    global List<SerializedProduct> SerializedProducts;
    global List<ServiceAppointment> ServiceAppointments;
    global List<Task> Tasks;
    global List<TopicAssignment> TopicAssignments;
    global List<WorkOrder> WorkOrders;
    global List<WorkOrderLineItem> WorkOrderLineItems;
    global List<WorkPlanSelectionRule> WorkPlanSelectionRules;
    global List<AIInsightValue> SobjectLookupValue;
    global List<AIRecordInsight> Target;
    global List<Asset> RootAsset;
    global List<AssetAttributeChangeEvent> Asset;
    global List<AssetChangeEvent> Parent;
    global List<AssetChangeEvent> RootAsset;
    global List<AssetTokenEvent> Asset;
    global List<ContentDocumentLinkChangeEvent> LinkedEntity;
    global List<ContentVersion> FirstPublishLocation;
    global List<ContractLineItemChangeEvent> Asset;
    global List<EmailMessageChangeEvent> RelatedTo;
    global List<EntitlementChangeEvent> Asset;
    global List<EventChangeEvent> What;
    global List<EventRelationChangeEvent> Relation;
    global List<FeedComment> Parent;
    global List<FlowExecutionErrorEvent> ContextRecord;
    global List<FlowOrchestrationWorkItem> RelatedRecord;
    global List<MaintenanceAssetChangeEvent> Asset;
    global List<OutgoingEmail> RelatedTo;
    global List<RecordsetFltrCritMonitorChangeEvent> Asset;
    global List<ServiceAppointmentChangeEvent> ParentRecord;
    global List<TaskChangeEvent> What;
    global List<WorkOrderChangeEvent> Asset;

    global Asset () 
    {
    }
}