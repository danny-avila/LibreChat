[![npm](https://img.shields.io/npm/v/react-secure-storage.svg)](https://www.npmjs.com/package/react-secure-storage) [![downloads](https://img.shields.io/npm/dm/react-secure-storage.svg)](http://npm-stat.com/charts.html?package=react-secure-storage)

## The problem statement!

Most of the people save data into local storage, Is this a safe method to store ? No! Local storage writes the data as a plan string and any one who has the access to the device can read this data and manipulate. 

Most of the people thinks that we can encrypt the data and save it on local storage, But in this case, you need to have a secure key to decrypt this data, 

Let's consider this **Scenario**, You have encrypted the user login information and saved on local storage, When the platform reload, You are decrypting the data which is written on local storage and marking the user as logged or logged out, Here your website share a common secure key to encrypt and decrypt,  which means only your website knows how to decrypt, 

In this case, if someone copies the data from local storage and past on a different browser, then load your website, Your website will authenticate the user, Why ? because your website knows how to decrypt the data!

This is the problem when you have a single secure key! **Then how do we solve this issue ?**



## Why React Secure Storage ?

React secure storage is created to securely write the data to local storage ( **Basically its a wrapper written on top of default localStorage to write the data securely to the localStorage** ), here secure storage library generate a secure key for every browser and encrypt the data using this key, which means only the browser which encrypted the data can decrypt it, 

Additionally react secure storage preserve the data format for every data type, As out of the box it supports the following data types 

**String | Object | Number | Boolean**

Which means you don't need to explicitly convert every data to string



## How does it work ?

React secure storage is written in Singleton design pattern, and when the library initialized it reads all the data from local storage and decrypt all the data which is written using react-secure-storage and keeps on the memory, This ensure faster reading of all the data,

The key is generated using browser fingerprint, which is generated using 10+ browser key identifiers and user input secure key,

The user specific Secure key can be configured using  .env file as

    SECURE_LOCAL_STORAGE_HASH_KEY=xxxxxxxxx


Secure local storage prefix can be configured using .env file as

	SECURE_LOCAL_STORAGE_PREFIX=xxxxxxx



### Here are the .env prefix lists for the supported languages that are built-in.

| Language | Prefix       |
|----------|--------------|
| React    | REACT_APP_   |
| Vite     | VITE_        |
| Next.Js  | NEXT_PUBLIC_ |

You can always use the environment variables without the prefix as well


## How to use

To use the library first you need to install using 

    yarn add react-secure-storage

or

    npm install react-secure-storage

You can use the following methods to read and write items to secure local storage

|         Function       |Usecase                          | Datatype                         |
|----------------|-------------------------------|-----------------------------|
|`setItem(key, value)` |To set values to secure storage            |Supports `'String - Object - Number - Boolean'` as value            |
|`getItem(key)`        |To get values which is saved on secure local storage           | Return null if the key does not exits           |
|`removeItem(key)`          | To remove specified key from secure local storage|  |
|`clear()`          | Removed all data from secure local storage|  |

## How to use with Vite

In the latest version of Vite, process is not defined by default, It uses `import.meta.env`, 

To define the process, You need to add the following code inside `vite.config.ts`

	import { defineConfig } from 'vite'
	// ...
	export default defineConfig({
	  // ...
	  define: {
	    "process.env": {},
	  },
	}) 

Here you can pass all the required `ENV` variables supported by the library inside the process.env object

## To disable properties from key generation

If you wish to disable any of the key generation property, You can do it as below

	SECURE_LOCAL_STORAGE_DISABLED_KEYS=ScreenPrint|Plugins
or

	REACT_APP_SECURE_LOCAL_STORAGE_DISABLED_KEYS=ScreenPrint|Plugins

Here is the list of all the supported values `UserAgent|ScreenPrint|Plugins|Fonts|LocalStorage|SessionStorage|TimeZone|Language|SystemLanguage|Cookie|Canvas|Hostname`

>Here we strongly recommend you to not to disable any of the properties as more properties you have, more unique the browser fingerprint will be!



### How to use environment variables for the supported languages.

| Language | Key                                            | Usage                                                                            |
|----------|------------------------------------------------|----------------------------------------------------------------------------------|
| Default  | SECURE_LOCAL_STORAGE_HASH_KEY                  | Used to specify the user specific hash key                                        |
| Default  | SECURE_LOCAL_STORAGE_PREFIX                    | Used to change the local storage prefix where the data will be finally saved     |
| Default  | SECURE_LOCAL_STORAGE_DISABLED_KEYS             | Used to disable individual property from encryption / fingerprint key generation |
| React    | REACT_APP_SECURE_LOCAL_STORAGE_HASH_KEY        | Used to specify the user specific hash key                                        |
| React    | REACT_APP_SECURE_LOCAL_STORAGE_PREFIX          | Used to change the local storage prefix where the data will be finally saved     |
| React    | REACT_APP_SECURE_LOCAL_STORAGE_DISABLED_KEYS   | Used to disable individual property from encryption / fingerprint key generation |
| Vite     | VITE_SECURE_LOCAL_STORAGE_HASH_KEY             | Used to specify the user specific hash key                                        |
| Vite     | VITE_SECURE_LOCAL_STORAGE_PREFIX               | Used to change the local storage prefix where the data will be finally saved     |
| Vite     | VITE_SECURE_LOCAL_STORAGE_DISABLED_KEYS        | Used to disable individual property from encryption / fingerprint key generation |
| Next.Js  | NEXT_PUBLIC_SECURE_LOCAL_STORAGE_HASH_KEY      | Used to specify the user specific hash key                                        |
| Next.Js  | NEXT_PUBLIC_SECURE_LOCAL_STORAGE_PREFIX        | Used to change the local storage prefix where the data will be finally saved     |
| Next.Js  | NEXT_PUBLIC_SECURE_LOCAL_STORAGE_DISABLED_KEYS | Used to disable individual property from encryption / fingerprint key generation |

## Sample Code

    
    import { useEffect } from  "react";
    import  secureLocalStorage  from  "react-secure-storage";
    
      
    const App = () => {
	    useEffect(() => {
		    secureLocalStorage.setItem("object", {
			    message:  "This is testing of local storage",
		    });
		    secureLocalStorage.setItem("number", 12);
		    secureLocalStorage.setItem("string", "12");
		    secureLocalStorage.setItem("boolean", true);
		    let value = secureLocalStorage.getItem("boolean");
		}, []);
    
	   return (
		    <div>
			    This is a sample code
		    </div>
		);
    }
    
    export  default  App;


## Build Size ! 7.6KB

## Whats new in 1.3.2?

Regular bug fixes and https://github.com/sushinpv/react-secure-storage/issues/39 is resolved

## Whats new | Previous?

Added support for Vite and Next.js environment variables 

Now you can disable individual fingerprint generation properties, This is discussed in the following enhancement https://github.com/sushinpv/react-secure-storage/issues/14

Secure token returning null when the browser resizes problem was fixed. This was previously included as a security feature, but in the most recent update, it was removed. This was covered in the ensuing issue: https://github.com/sushinpv/react-secure-storage/issues/9

Now that we have included the browser hostname while establishing the secure key, it is more unique. This will guarantee that each website's key is distinct.

Added support for updating Local Storage prefix, Now this can be updated using .env

Resolved https://github.com/sushinpv/react-secure-storage/issues/2

Added support for `Cypress`

Added proper type definition for the entire package

Added support for older es versions and nextjs

Releasing the first version of react secure local storage, which supports `setItem`, `getItem`, `removeItem` and `clear` functions 

## How do I test this library on my local system & How do I contribute ?

For local testing the library make sure you are installing the `react-scripts` by using `npm i react-scripts` or `yarn add react-scripts`. 
The react-scripts is removed due to vulnerability issue which is highlighted in here : https://github.com/sushinpv/react-secure-storage/issues/3

To contribute on the library, make sure you are creating a development branch for your fix as `dev/{feature/fix}` and create a PR to master branch.

Before creating the PR, Please make sure to remove the `react-scripts` from the `package.json`. and you are creating a production build for the library by running `yarn build:lib`

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=sushinpv/react-secure-storage&type=Date)](https://star-history.com/#sushinpv/react-secure-storage&Date)
