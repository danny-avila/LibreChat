---
title: 🔎 Google Search
description: How to set up and use the Google Search Plugin, which allows you to query Google with GPT's help.
weight: -7
---

# Google Search Plugin
Through the plugins endpoint, you can use google search for answers to your questions with assistance from GPT! To get started, you need to get a Google Custom Search API key, and a Google Custom Search Engine ID. You can then define these as follows in your `.env` file:  
```env  
GOOGLE_SEARCH_API_KEY="...."  
GOOGLE_CSE_ID="...."  
```  
  
You first need to create a programmable search engine and get the search engine ID: **[https://developers.google.com/custom-search/docs/tutorial/creatingcse](https://developers.google.com/custom-search/docs/tutorial/creatingcse)**  
  
Then you can get the API key, click the "Get a key" button on this page: **[https://developers.google.com/custom-search/v1/introduction](https://developers.google.com/custom-search/v1/introduction)**

## 1\. Go to the [Programmable Search Engine docs](https://developers.google.com/custom-search/docs/tutorial/creatingcse) to get a Search engine ID



## 2\. Click on "Control Panel" under "Defining a Programmable Engine in Control Panel"


Click to sign in(make a Google acct if you do not have one):

![google_search-1](https://github.com/danny-avila/LibreChat/assets/32828263/51db1a90-c2dc-493c-b32c-821257c27b4e)


## 3\. Register yourself a new account/Login to the Control Panel


After logging in, you will be redirected to the Control Panel to create a new search engine:

![google_search-2](https://github.com/danny-avila/LibreChat/assets/32828263/152cfe7c-4796-49c6-9160-92cddf38f1c8)


## 4\. Create a new search engine


Fill in a name, select to "Search the entire web" and hit "Create":

![google_search-3](https://github.com/danny-avila/LibreChat/assets/32828263/c63441fc-bdb2-4086-bb7a-fcbe3d67aef9)


## 5\. Copy your Search engine ID to your .env file

![google_search-4](https://github.com/danny-avila/LibreChat/assets/32828263/e03b5c79-87e5-4a68-b83e-61faf4f2f718)


## 6\. Go to [custom-search docs](https://developers.google.com/custom-search/v1/introduction) to get a Google search API key


## 7\. Click "Get a Key":

![google_search-5](https://github.com/danny-avila/LibreChat/assets/32828263/2b93a2f9-5ed2-4794-96a8-a114e346a602)


## 8\. Name your project and agree to the Terms of Service

![google_search-6](https://github.com/danny-avila/LibreChat/assets/32828263/82c9c3ef-7363-40cd-a89e-fc45088e4c86)


## 9\. Copy your Google search API key to your .env file

![google_search-7](https://github.com/danny-avila/LibreChat/assets/32828263/8170206a-4ba6-40e3-b20e-bdbac21d6695)
