// This file is generated as an Apex representation of the
//     corresponding sObject and its fields.
// This read-only file is used by the Apex Language Server to
//     provide code smartness, and is deleted each time you
//     refresh your sObject definitions.
// To edit your sObjects and their fields, edit the corresponding
//     .object-meta.xml and .field-meta.xml files.

global class Order {
    global Id Id;
    global SObject Owner;
    global Id OwnerId;
    global Contract Contract;
    global Id ContractId;
    global Account Account;
    global Id AccountId;
    global Pricebook2 Pricebook2;
    global Id Pricebook2Id;
    global Order OriginalOrder;
    global Id OriginalOrderId;
    global Date EffectiveDate;
    global Date EndDate;
    global Boolean IsReductionOrder;
    global String Status;
    global String Description;
    global Contact CustomerAuthorizedBy;
    global Id CustomerAuthorizedById;
    global Date CustomerAuthorizedDate;
    global User CompanyAuthorizedBy;
    global Id CompanyAuthorizedById;
    global Date CompanyAuthorizedDate;
    global String Type;
    global String BillingStreet;
    global String BillingCity;
    global String BillingState;
    global String BillingPostalCode;
    global String BillingCountry;
    global Double BillingLatitude;
    global Double BillingLongitude;
    global String BillingGeocodeAccuracy;
    global Address BillingAddress;
    global String ShippingStreet;
    global String ShippingCity;
    global String ShippingState;
    global String ShippingPostalCode;
    global String ShippingCountry;
    global Double ShippingLatitude;
    global Double ShippingLongitude;
    global String ShippingGeocodeAccuracy;
    global Address ShippingAddress;
    global String Name;
    global Date PoDate;
    global String PoNumber;
    global String OrderReferenceNumber;
    global Contact BillToContact;
    global Id BillToContactId;
    global Contact ShipToContact;
    global Id ShipToContactId;
    global Datetime ActivatedDate;
    global User ActivatedBy;
    global Id ActivatedById;
    global String StatusCode;
    global String OrderNumber;
    global Decimal TotalAmount;
    global Datetime CreatedDate;
    global User CreatedBy;
    global Id CreatedById;
    global Datetime LastModifiedDate;
    global User LastModifiedBy;
    global Id LastModifiedById;
    global Boolean IsDeleted;
    global Datetime SystemModstamp;
    global Datetime LastViewedDate;
    global Datetime LastReferencedDate;
    global List<ActivityHistory> ActivityHistories;
    global List<AppUsageAssignment> AppUsageAssignments;
    global List<AttachedContentDocument> AttachedContentDocuments;
    global List<Attachment> Attachments;
    global List<CombinedAttachment> CombinedAttachments;
    global List<ContentDocumentLink> ContentDocumentLinks;
    global List<CreditMemo> CreditMemos;
    global List<DigitalSignature> DigitalSignatures;
    global List<EmailMessage> Emails;
    global List<EntitySubscription> FeedSubscriptionsForEntity;
    global List<Event> Events;
    global List<Invoice> Invoices;
    global List<Note> Notes;
    global List<NoteAndAttachment> NotesAndAttachments;
    global List<OpenActivity> OpenActivities;
    global List<Order> Orders;
    global List<OrderFeed> Feeds;
    global List<OrderHistory> Histories;
    global List<OrderItem> OrderItems;
    global List<OrderShare> Shares;
    global List<PaymentGroup> PaymentGroups;
    global List<ProcessException> ProcessExceptions;
    global List<ProcessInstance> ProcessInstances;
    global List<ProcessInstanceHistory> ProcessSteps;
    global List<RecordAction> RecordActions;
    global List<RecordActionHistory> RecordActionHistories;
    global List<ReturnOrder> ReturnOrders;
    global List<Task> Tasks;
    global List<TopicAssignment> TopicAssignments;
    global List<WorkOrderLineItem> WorkOrderLineItems;
    global List<AIInsightValue> SobjectLookupValue;
    global List<AIRecordInsight> Target;
    global List<ContentDocumentLinkChangeEvent> LinkedEntity;
    global List<ContentVersion> FirstPublishLocation;
    global List<DigitalSignatureChangeEvent> Parent;
    global List<EmailMessageChangeEvent> RelatedTo;
    global List<EventChangeEvent> What;
    global List<EventRelationChangeEvent> Relation;
    global List<FeedComment> Parent;
    global List<FlowExecutionErrorEvent> ContextRecord;
    global List<FlowOrchestrationWorkItem> RelatedRecord;
    global List<OrderChangeEvent> OriginalOrder;
    global List<OrderItemChangeEvent> Order;
    global List<OutgoingEmail> RelatedTo;
    global List<ProcessExceptionEvent> AttachedTo;
    global List<ReturnOrderChangeEvent> Order;
    global List<TaskChangeEvent> What;
    global List<WorkOrderLineItemChangeEvent> Order;

    global Order () 
    {
    }
}