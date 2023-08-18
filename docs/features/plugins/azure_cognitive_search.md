# Azure Cognitive Search Plugin
Through the plugins endpoint, you can use Azure Cognitive Search for answers to your questions with assistance from GPT.

## Configurations

### Required

To get started, you need to get a Azure Cognitive Search endpoint URL, index name, and a API Key. You can then define these as follows in your `.env` file:
```env
AZURE_COGNITIVE_SEARCH_SERVICE_ENDPOINT="..."
AZURE_COGNITIVE_SEARCH_INDEX_NAME="..."
AZURE_COGNITIVE_SEARCH_API_KEY="..."
```

### AZURE_COGNITIVE_SEARCH_SERVICE_ENDPOINT

This is the URL of the search endpoint. It can be obtained from the top page of the search service in the Cognitive Search management console (e.g., 'https://example.search.windows.net').

### AZURE_COGNITIVE_SEARCH_INDEX_NAME

This is the name of the index to be searched (e.g., 'hotels-sample-index').

### AZURE_COGNITIVE_SEARCH_API_KEY

This is the authentication key to use when utilizing the search endpoint. Please issue it from the management console. Use the Value, not the name of the authentication key.

### Optional

The following are configuration values that are not required but can be specified as parameters during a search.

If there are concerns that the search result data may be too large and exceed the prompt size, consider reducing the size of the search result data by using AZURE_COGNITIVE_SEARCH_SEARCH_OPTION_TOP and AZURE_COGNITIVE_SEARCH_SEARCH_OPTION_SELECT.

For details on each parameter, please refer to the following document:
https://learn.microsoft.com/en-us/rest/api/searchservice/search-documents

```env
AZURE_COGNITIVE_SEARCH_API_VERSION=2023-07-01-Preview
AZURE_COGNITIVE_SEARCH_SEARCH_OPTION_QUERY_TYPE=simple
AZURE_COGNITIVE_SEARCH_SEARCH_OPTION_TOP=3
AZURE_COGNITIVE_SEARCH_SEARCH_OPTION_SELECT=field1,field2,field3
```

#### AZURE_COGNITIVE_SEARCH_API_VERSION

Specify the version of the search API. When using new features such as semantic search, you may need to specify the preview version. The default value is '2020-06-30'.

#### AZURE_COGNITIVE_SEARCH_SEARCH_OPTION_QUERY_TYPE

Specify 'simple' or 'full'. The default value is 'simple'.

#### AZURE_COGNITIVE_SEARCH_SEARCH_OPTION_TOP

Specify the number of items to search for. The default value is 5.

#### AZURE_COGNITIVE_SEARCH_SEARCH_OPTION_SELECT

Specify the fields of the index to be retrieved, separated by commas. Please note that these are not the fields to be searched.