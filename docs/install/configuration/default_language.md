---
title: 🌍 Default Language
description: How to change LibreChat's default language
weight: -3
---

# Default Language 🌍

## How to change the default language

- Open this file `client\src\store\language.ts`
- Modify the "default" in the lang variable with your locale identifier :

Example: 
from **English** as default

```js
import { atom } from 'recoil';

const lang = atom({
  key: 'lang',
  default: localStorage.getItem('lang') || 'en-US',
});

export default { lang };
```

to **Italian** as default 

```js
import { atom } from 'recoil';

const lang = atom({
  key: 'lang',
  default: localStorage.getItem('lang') || 'it-IT',
});

export default { lang };
```
---
 
> **❗If you wish to contribute your own translation to LibreChat, please refer to this document for instructions: [Contribute a Translation](../../contributions/translation_contribution.md)**
