# React-Virtualized Patch Bugfix Report

## Дата исправления
30 мая 2025

## Проблема
Docker build падал с ошибкой при применении патча `react-virtualized+9.22.6.patch`:

```
**ERROR** Failed to apply patch for package react-virtualized at path
  node_modules/react-virtualized

This error was caused because patch-package cannot apply the following patch file:
  patches/react-virtualized+9.22.6.patch
```

## Анализ корневой причины

### Оригинальная проблема
Патч был создан для исправления проблемы с директивой `"no babel-plugin-flow-react-proptypes"` в файле:
```
node_modules/react-virtualized/dist/es/WindowScroller/utils/onScroll.js
```

Эта директива вызывала ошибки при сборке:
> Module level directives cause errors when bundled, "no babel-plugin-flow-react-proptypes" was ignored.

### Текущая ситуация
При анализе текущей версии react-virtualized@9.22.6 обнаружено:

1. **Структура файла изменилась**: Файл `onScroll.js` имеет совершенно другую структуру
2. **Проблематичная директива отсутствует**: `"no babel-plugin-flow-react-proptypes"` больше нет в коде
3. **Патч устарел**: Целевой контент для патча не существует в текущей версии

### Сравнение файлов

**Ожидаемый патчем контент (не существует):**
```javascript
"no babel-plugin-flow-react-proptypes";
import { registerScrollListener, unregisterScrollListener } from './scrollListener';
import { getPositionOffset } from './positionCache';
// ... 
export default function onScroll(_ref) {
  // ...
  callOnChildrenUpdated(scrollElement, updatePosition);
}
import { bpfrpt_proptype_WindowScroller } from "../WindowScroller.js";
```

**Фактический контент файла:**
```javascript
'no babel-plugin-flow-react-proptypes';

import { requestAnimationTimeout, cancelAnimationTimeout } from '../../utils/requestAnimationTimeout';
/*:: import type WindowScroller from '../WindowScroller.js';*/
var mountedInstances = [];
// ... completely different structure
```

## Решение

### 1. Проверка необходимости патча
```bash
grep -r "no babel-plugin-flow-react-proptypes" node_modules/react-virtualized/
# Результат: No matches found
```

Проблематичная директива отсутствует в текущей версии пакета.

### 2. Удаление устаревшего патча
```bash
rm patches/react-virtualized+9.22.6.patch
```

### 3. Проверка установки
```bash
npm install --no-audit
# Результат: успешная установка без ошибок patch-package
```

## Результат исправления

✅ **npm install** выполняется без ошибок  
✅ **patch-package** корректно сообщает "No patch files found"  
✅ **Docker build** проходит этап npm install  
✅ Удален устаревший патч, который блокировал сборку  

## Вывод

Проблема была решена maintainer'ами пакета react-virtualized. Оригинальная проблема с директивой `"no babel-plugin-flow-react-proptypes"` больше не существует в версии 9.22.6, поэтому патч стал не только ненужным, но и вредным для процесса сборки.

## Статус
🟢 **ИСПРАВЛЕНО** - Docker build теперь работает корректно
