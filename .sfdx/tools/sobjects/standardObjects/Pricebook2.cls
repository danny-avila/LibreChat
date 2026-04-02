// This file is generated as an Apex representation of the
//     corresponding sObject and its fields.
// This read-only file is used by the Apex Language Server to
//     provide code smartness, and is deleted each time you
//     refresh your sObject definitions.
// To edit your sObjects and their fields, edit the corresponding
//     .object-meta.xml and .field-meta.xml files.

global class Pricebook2 {
    global Id Id;
    global Boolean IsDeleted;
    global String Name;
    global Datetime CreatedDate;
    global User CreatedBy;
    global Id CreatedById;
    global Datetime LastModifiedDate;
    global User LastModifiedBy;
    global Id LastModifiedById;
    global Datetime SystemModstamp;
    global Datetime LastViewedDate;
    global Datetime LastReferencedDate;
    global Boolean IsActive;
    global Boolean IsArchived;
    global String Description;
    global Boolean IsStandard;
    global List<AssetWarranty> AssetWarrantyPricebooks;
    global List<Contract> Contracts;
    global List<Opportunity> Opportunities;
    global List<Order> Orders;
    global List<Pricebook2History> Histories;
    global List<PricebookEntry> PricebookEntries;
    global List<RecordAction> RecordActions;
    global List<RecordActionHistory> RecordActionHistories;
    global List<ServiceContract> ServiceContracts;
    global List<WarrantyTerm> Pricebook2;
    global List<WorkOrder> WorkOrders;
    global List<AIInsightValue> SobjectLookupValue;
    global List<AIRecordInsight> Target;
    global List<AssetWarrantyChangeEvent> Pricebook2;
    global List<FlowExecutionErrorEvent> ContextRecord;
    global List<FlowRecordRelation> RelatedRecord;
    global List<OpportunityChangeEvent> Pricebook2;

    global Pricebook2 () 
    {
    }
}