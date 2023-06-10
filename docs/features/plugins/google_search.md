# Google Search Plugin
Through the plugins endpoint, you can use google search for answers to your questions with assistance from GPT! To get started, you need to get a Google Custom Search API key, and a Google Custom Search Engine ID. You can then define these as follows in your `.env` file:  
```env  
GOOGLE_API_KEY="...."  
GOOGLE_CSE_ID="...."  
```  
  
You first need to create a programmable search engine and get the search engine ID: https://developers.google.com/custom-search/docs/tutorial/creatingcse  
  
Then you can get the API key, click the "Get a key" button on this page: https://developers.google.com/custom-search/v1/introduction  

<!-- You can limit the max price that is charged for a single search request by setting `MAX_SEARCH_PRICE` in your `.env` file. -->


## 1\. Go to the [Programmable Search Engine docs](https://developers.google.com/custom-search/docs/tutorial/creatingcse) to get a Search engine ID



## 2\. Click on "Control Panel" under "Defining a Programmable Engine in Control Panel"


Click to sign in(make a Google acct if you do not have one):

![image](https://user-images.githubusercontent.com/23362597/233266042-98098ed5-72b2-41b3-9495-1a9f4d7e1101.png)


## 3\. Register yourself a new account/Login to the Control Panel


After logging in, you will be redirected to the Control Panel to create a new search engine:

![image](https://user-images.githubusercontent.com/23362597/233266323-53232468-2590-4820-b55f-08c78529d752.png)


## 4\. Create a new search engine


Fill in a name, select to "Search the entire web" and hit "Create":

![image](https://user-images.githubusercontent.com/23362597/233266738-b70f004d-4324-482e-a945-9b0193b60158.png)


## 5\. Copy your Search engine ID to your .env file


![image](https://user-images.githubusercontent.com/23362597/233267123-ea25a3bb-6cdb-4d46-a893-846ea4933632.png)


## 6\. Go to [custom-search docs](https://developers.google.com/custom-search/v1/introduction) to get a Google search API key


Click "Get a Key":

![image](https://user-images.githubusercontent.com/23362597/233267659-f82621f4-1f0b-46bf-8994-be443dd79932.png)


## 8\. Name your project and agree to the Terms of Service


![image](https://user-images.githubusercontent.com/23362597/233267793-ca3c273d-ebc6-44a5-a49d-0d4c3223c992.png)


## 9\. Copy your Google search API key to your .env file


![image](https://user-images.githubusercontent.com/23362597/233268067-5a6cfaf1-bec0-48b3-8add-70b218fb4264.png)
##

## [Go Back to ReadMe](../../../README.md)
