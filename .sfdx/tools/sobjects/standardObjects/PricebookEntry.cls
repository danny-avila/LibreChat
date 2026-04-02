// This file is generated as an Apex representation of the
//     corresponding sObject and its fields.
// This read-only file is used by the Apex Language Server to
//     provide code smartness, and is deleted each time you
//     refresh your sObject definitions.
// To edit your sObjects and their fields, edit the corresponding
//     .object-meta.xml and .field-meta.xml files.

global class PricebookEntry {
    global Id Id;
    global String Name;
    global Pricebook2 Pricebook2;
    global Id Pricebook2Id;
    global Product2 Product2;
    global Id Product2Id;
    global Decimal UnitPrice;
    global Boolean IsActive;
    global Boolean UseStandardPrice;
    global Datetime CreatedDate;
    global User CreatedBy;
    global Id CreatedById;
    global Datetime LastModifiedDate;
    global User LastModifiedBy;
    global Id LastModifiedById;
    global Datetime SystemModstamp;
    global String ProductCode;
    global Boolean IsDeleted;
    global Boolean IsArchived;
    global List<ContractLineItem> ContractLineItems;
    global List<OpportunityLineItem> OpportunityLineItems;
    global List<OrderItem> OrderItems;
    global List<PricebookEntryHistory> Histories;
    global List<ProductConsumed> ProductsConsumed;
    global List<RecordAction> RecordActions;
    global List<RecordActionHistory> RecordActionHistories;
    global List<WorkOrderLineItem> WorkOrderLineItems;
    global List<AIInsightValue> SobjectLookupValue;
    global List<AIRecordInsight> Target;
    global List<ContractLineItemChangeEvent> PricebookEntry;
    global List<FlowExecutionErrorEvent> ContextRecord;
    global List<FlowRecordRelation> RelatedRecord;
    global List<OrderItemChangeEvent> PricebookEntry;

    global PricebookEntry () 
    {
    }
}