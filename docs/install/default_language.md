# Default Language 🌍

## How to change the default language

- Open this file `client\src\store\language.js`
- Modify the "default" in the lang variable with your ISO 3166 Alpha-2 code :

Example: 
from **English** as default

```js
import { atom } from 'recoil';

const lang = atom({
  key: 'lang',
  default: 'en',
});

export default { lang };
```

to **Italian** as default 

```js
import { atom } from 'recoil';

const lang = atom({
  key: 'lang',
  default: 'it',
});

export default { lang };
```
---
 
> **❗If you wish to contribute your own translation to LibreChat, please refer to this document for instructions: [Contribute a Translation](../contributions/translation_contribution.md)**
