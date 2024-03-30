---
title: 🧑‍💼 Official ChatGPT Plugins
description: How to add official OpenAI Plugins to LibreChat
weight: -8
---
# Using official ChatGPT Plugins / OpenAPI specs

ChatGPT plugins are API integrations for OpenAI models that extend their capabilities. They are structured around three key components: an API, an **OpenAPI specification** (spec for short), and a JSON **Plugin Manifest** file. 

To learn more about them, or how to make your own, read here: **[ChatGPT Plugins: Getting Started](https://platform.openai.com/docs/plugins/getting-started)**

Thanks to the introduction of **[OpenAI Functions](https://openai.com/blog/function-calling-and-other-api-updates)** and their utilization in **[Langchain](https://js.langchain.com/docs/modules/chains/openai_functions/openapi)**, it's now possible to directly use OpenAI Plugins through LibreChat, without building any custom langchain tools. The main use case we gain from integrating them to LibreChat is to allow use of plugins with gpt-3.5 models, and without ChatGPT Plus. They also find a great use case when you want to limit your own private API's interactions with chat.openai.com and their servers in favor of a self-hosted LibreChat instance.

## Intro

Before continuing, it's important to fully distinguish what a Manifest file is vs. an OpenAPI specification.

### **[Plugin Manifest File:](https://platform.openai.com/docs/plugins/getting-started/plugin-manifest)**
- Usually hosted on the API’s domain as `https://example.com/.well-known/ai-plugin.json`
- The manifest file is required for LLMs to connect with your plugin. If there is no file found, the plugin cannot be installed.
- Has required properties, and will error if they are missing. Check what they are in the **[OpenAI Docs](https://platform.openai.com/docs/plugins/getting-started/plugin-manifest)**
- Has optional properties, specific to LibreChat, that will enable them to work consistently, or for customizing headers/params made by every API call (see below)

### **[OpenAPI Spec](https://platform.openai.com/docs/plugins/getting-started/openapi-definition)**
- The OpenAPI specification is used to document the API that the plugin will interact with. It is a **[universal format](https://www.openapis.org/)** meant to standardize API definitions.
- Referenced by the Manifest file in its `api.url` property
  - Usually as `https://example.com/openapi.yaml` or `.../swagger.yaml`
  - Can be a .yaml or .json file
- The LLM only knows about your API based on what is defined in this specification and the manifest file.
- The specification can be tailored to expose specific endpoints of your API to the model, allowing you to control the functionality that the model can access.
- The OpenAPI specification is the wrapper that sits on top of your API.
- When a query is run by the LLM, it will look at the description that is defined in the info section of the OpenAPI specification to determine if the plugin is relevant for the user query.

## Adding a Plugin

In a future update, you will be able to add plugins via url on the frontend; for now, you will have to add them to the project locally.

Download the Plugin manifest file, or copy the raw JSON data into a new file, and drop it in the following project path:

`api\app\clients\tools\.well-known`

You should see multiple manifest files that have been tested, or edited, to work with LibreChat. As of v0.5.8, It's **required** to name the manifest JSON file after its `name_for_model` property should you add one yourself.

After doing so, start/re-start the project server and they should now load in the Plugin store.

---

## Editing Manifest Files

>Note: the following configurations are specific to optimizing manifest files for LibreChat, which is sometimes necessary for plugins to work properly with LibreChat, but also useful if you are developing your own plugins and want to make sure it's compatible with both ChatGPT and LibreChat

If your plugin works right out of the box by adding it like above, that's great! However, in some cases, further configuration is desired or required.

With the current implementation, for some ChatGPT plugins, the LLM will stubbornly ignore required values for specific parameters. I was having this issue with the ScholarAI plugin, where it would not obey the requirement to have either 'cited_by_count' or 'publication_date' as the value for its 'sort' parameter. I used the following as a reliable workaround this issue.

### Override Parameter Values

Add a params object with the desired parameters to include with every API call, to manually override whatever the LLM generates for these values. You can also exclude instructions for these parameters in your custom spec to optimize API calling (more on that later).

```json
  "params": {
    "sort": "cited_by_count"
  },
```

### Add Header Fields

If you would like to add headers to every API call, you can specify them in the manifest file like this:

```json
  "headers": {
    "librechat_user_id": "WebPilot-Friend-UID"
  },
```

Note: as the name suggests, the "librechat_user_id" Header field is handled in a special way for LibreChat. Use this whenever you want to pass the userId of the current user as a header value. 

In other words, the above is equivalent to:
```bash
curl -H "WebPilot-Friend-UID: <insert librechat_user_id here>" https://webreader.webpilotai.com/api/visit-web
```

Hard-coding header fields may also be useful for basic authentication; however, it's recommended you follow the authentication guide below instead to make your plugin compatible for ChatGPT as well.  

### Custom OpenAPI Spec files

Sometimes, manifest files are formatted perfectly but their corresponding spec files leave something to be desired. This was the case for me with the AskYourPDF Plugin, where the `server.url` field was omitted. You can also save on tokens by configuring a spec file to your liking, if you know you will never need certain endpoints. Or, this is useful if you are developing 

In any case, you have two options. 

**Option 1:** Replace the `api.url` value to another remotely hosted spec

```json
  "api": {
    "type": "openapi",
    "url": "https://some-other-domain.com/openapi.yaml",
    "is_user_authenticated": false
  },
```

**Option 2:** Place your yaml or json spec locally in the following project path:

`api\app\clients\tools\.well-known\openapi\`

- Replace the `api.url` value to the filename.

```json
  "api": {
    "type": "openapi",
    "url": "scholarai.yaml",
    "is_user_authenticated": false
  },
```

LibreChat will then load the following OpenAPI spec instead of fetching from the internet.

`api\app\clients\tools\.well-known\openapi\scholarai.yaml`

### Plugins with Authentication

If you look at the VoxScript manifest file, you will notice it has an `auth` property like this:

```json
  "auth": {
    "type": "service_http",
    "authorization_type": "bearer",
    "verification_tokens": {
      "openai": "ffc5226d1af346c08a98dee7deec9f76"
    }
  },
```

This is equivalent to an HTTP curl request with the following header:

```bash
curl -H "Authorization: Bearer ffc5226d1af346c08a98dee7deec9f76" https://example.com/api/
```

As of now, LibreChat only supports plugins using Bearer Authentication, like in the example above.

If your plugin requires authentication, it's necessary to have these fields filled in your manifest file according to **[OpenAI definitions](https://platform.openai.com/docs/plugins/getting-started/plugin-manifest)**, which for Bearer Authentication must follow the schema above.

Important: Some ChatGPT plugins may use Bearer Auth., but have either stale verification tokens in their manifest, or only support calls from OpenAI servers. Web Pilot is one with the latter case, and thankfully it has a required header field for allowing non-OpenAI origination. See above for editing headers. 

>Note: some ChatGPT plugins use OAuth authentication, which is not foreseeable we will be able to use as it requires manual configurations (redirect uri and client secrets) for both the plugin's servers and OpenAI's servers. Sadly, an example of this is Noteable, which is one of my favorite plugins; however, OAuth that authorizes the domain of your LibreChat app will be possible in a future update. On Noteable: it may be possible to reverse-engineer the noteable plugin for a "code interpreter" experience, and is a stretch goal on the LibreChat roadmap.

---

### Showcase
![image](https://github.com/danny-avila/LibreChat/assets/110412045/245cd671-c0fc-42a5-b395-fb8cf8ea8d5f)
![image](https://github.com/danny-avila/LibreChat/assets/110412045/ea5a6fe5-abfb-42e9-98d0-21f7c24f7b6c)

---

## Disclaimers

Use of ChatGPT Plugins is only possible with official OpenAI models and their use of **[Functions](https://platform.openai.com/docs/api-reference/chat/create#chat/create-functions)**. If you are accessing OpenAI models via reverse proxy through some 3rd party service, function calling may not be supported.

This implementation depends on the **[LangChain OpenAPI Chain](https://js.langchain.com/docs/modules/chains/openai_functions/openapi)** and general improvements to its use here will have to be made to the LangChainJS library.

Custom Langchain Tools are preferred over ChatGPT Plugins/OpenAPI specs as this can be more token-efficient, especially with OpenAI Functions. A better alternative may be to make a Langchain tool modelled after an OpenAPI spec, for which I'll make a guide soon.

LibreChat's implementation is not 1:1 with ChatGPT's, as OpenAI has a robust, exclusive, and restricted authentication pipeline with its models & specific plugins, which are not as limited by context windows and token usage. Furthermore, some of their hosted plugins requiring authentication will not work, especially those with OAuth or stale verification tokens, and some may not be handled by the LLM in the same manner, especially those requiring multi-step API calls.

Some plugins may detect that the API call does not originate from OpenAI's servers, will either be defunct outside of **[chat.openai.com](https://chat.openai.com/)** or need special handling, and/or editing of their manifest/spec files. This is not to say plugin use will not improve and more closely mirror how ChatGPT handles plugins, but there is still work to this end. In short, some will work perfectly while others may not work at all. 

The use of ChatGPT Plugins with LibreChat does not violate OpenAI's **[Terms of Service](https://openai.com/policies/terms-of-use)**. According to their **[Service Terms](https://openai.com/policies/service-terms)** and **[Usage Policies](https://openai.com/policies/usage-policies)**, the host, in this case OpenAI, is not responsible for the plugins hosted on their site and their usage outside of their platform, **[chat.openai.com](https://chat.openai.com/)**. Furthermore, there is no explicit mention of restrictions on accessing data that is not directly displayed to the user. Therefore, accessing the payload of their plugins for display purposes is not in violation of their Terms of Service.

Please note that the ChatGPT Plugins integration is currently in an alpha state, and you may encounter errors. Although preliminary testing has been conducted, not all plugins have been thoroughly tested, and you may find that some I haven't added will not work for any one of the reasons I've mentioned above. Some of the errors may be caused by the plugin itself, and will also not work on **[chat.openai.com](https://chat.openai.com/)**. If you encounter any errors, double checking if they work on the official site is advisable before reporting them as a GitHub issue. I can only speak for the ones I tested and included, and the date of inclusion.
