// This file is generated as an Apex representation of the
//     corresponding sObject and its fields.
// This read-only file is used by the Apex Language Server to
//     provide code smartness, and is deleted each time you
//     refresh your sObject definitions.
// To edit your sObjects and their fields, edit the corresponding
//     .object-meta.xml and .field-meta.xml files.

global class Domain {
    global Id Id;
    global String DomainType;
    global String Domain;
    global Boolean OptionsHstsPreload;
    global String CnameTarget;
    global String HttpsOption;
    global Datetime CreatedDate;
    global User CreatedBy;
    global Id CreatedById;
    global Datetime LastModifiedDate;
    global User LastModifiedBy;
    global Id LastModifiedById;
    global Datetime SystemModstamp;
    global List<DomainSite> DomainSites;
    global List<ManagedContentChannel> Domain;

    global Domain () 
    {
    }
}