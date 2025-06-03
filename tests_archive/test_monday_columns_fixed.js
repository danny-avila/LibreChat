/**
 * Тест исправленных функций обновления колонок Monday.com API
 * Использование: MONDAY_API_KEY=ваш_токен node test_monday_columns_fixed.js
 */

const { MondayTool } = require('./api/app/clients/tools/structured/MondayTool');

async function testColumnUpdates() {
  console.log('🚀 Тестирование исправленных функций обновления колонок Monday.com...\n');

  // Получаем API ключ из переменной окружения
  const apiKey = process.env.MONDAY_API_KEY;
  
  if (!apiKey) {
    console.error('❌ Установите переменную окружения MONDAY_API_KEY');
    console.log('Пример: MONDAY_API_KEY=your_token node test_monday_columns_fixed.js');
    process.exit(1);
  }

  // Создаем экземпляр MondayTool
  const mondayTool = new MondayTool({
    MONDAY_API_KEY: apiKey
  });

  try {
    // 1. Получаем тестовую доску
    console.log('📋 Шаг 1: Получение тестовой доски...');
    const boardsResult = await mondayTool._call({
      action: 'getBoards',
      limit: 1
    });
    
    const boards = JSON.parse(boardsResult).data;
    if (boards.length === 0) {
      console.log('❌ Нет доступных досок для тестирования');
      return;
    }

    const testBoard = boards[0];
    console.log(`✅ Используем доску: "${testBoard.name}" (ID: ${testBoard.id})`);

    // 2. Получаем информацию о колонках
    console.log('\n📋 Шаг 2: Получение информации о колонках...');
    let columnsResult = await mondayTool._call({
      action: 'getColumnsInfo',
      boardId: testBoard.id
    });
    
    let columnsData = JSON.parse(columnsResult);
    let columns = columnsData.data || []; // Используем let для возможности обновления
    const initialColumnsForMultipleUpdate = [...columns]; // Копия для шага 5
    console.log(`✅ Найдено колонок: ${columns.length}`);

    // 3. Создаем тестовый элемент
    console.log('\n📋 Шаг 3: Создание тестового элемента...');
    const createResult = await mondayTool._call({
      action: 'createItem',
      boardId: testBoard.id,
      itemName: 'Test Item for Column Updates'
    });
    
    const createdItem = JSON.parse(createResult).data;
    console.log(`✅ Создан элемент: "${createdItem.name}" (ID: ${createdItem.id})`);

    // Формируем и выводим ссылку на элемент
    const mondayDomain = process.env.MONDAY_DOMAIN || 'retailbox-company'; // Используем ваш домен
    const itemLink = `https://${mondayDomain}.monday.com/boards/${testBoard.id}/pulses/${createdItem.id}`;
    console.log(`🔗 Прямая ссылка на тестовый элемент: ${itemLink}`);

    // 4. Тестируем обновление различных типов колонок
    console.log('\n📋 Шаг 4: Тестирование обновления колонок...');

    // Тестовые значения для разных типов колонок
    const testCases = [
      {
        type: 'text',
        value: 'Updated text value',
        description: 'Текстовая колонка'
      },
      {
        type: 'numbers',
        value: '42',
        description: 'Числовая колонка'
      },
      {
        type: 'status',
        value: { index: 1 },
        description: 'Статус колонка'
      },
      {
        type: 'date',
        value: { date: '2024-03-20' },
        description: 'Дата колонка'
      },
      {
        type: 'checkbox',
        value: { checked: true },
        description: 'Чекбокс колонка'
      }
    ];

    for (const testCase of testCases) {
      let column = columns.find(col => col.type === testCase.type);
      
      if (!column) {
        console.log(`\n⚠️ ${testCase.description} (${testCase.type}) не найдена, создаем новую...`);
        try {
          const createColumnResult = await mondayTool._call({
            action: 'createColumn',
            boardId: testBoard.id,
            title: `Test ${testCase.description}`,
            columnType: testCase.type
          });
          const createdColumnData = JSON.parse(createColumnResult);
          if (createdColumnData.success && createdColumnData.data) {
            column = createdColumnData.data;
            console.log(`✅ Новая ${testCase.description} (ID: ${column.id}) создана.`);
            // Обновляем список колонок, чтобы он был актуальным
            columnsResult = await mondayTool._call({ action: 'getColumnsInfo', boardId: testBoard.id });
            columnsData = JSON.parse(columnsResult);
            columns = columnsData.data || [];
            // Небольшая пауза, чтобы API успел обработать создание колонки
            await new Promise(resolve => setTimeout(resolve, 2000)); 
          } else {
            console.log(`❌ Ошибка создания ${testCase.description}: ${createdColumnData.error || 'Неизвестная ошибка'}`);
            continue; // Пропускаем этот тест, если колонка не создана
          }
        } catch (error) {
          console.log(`❌ Исключение при создании ${testCase.description}: ${error.message}`);
          continue;
        }
      }

      if (column) { // Дополнительная проверка, что колонка точно есть
        console.log(`\n🔧 Тестируем ${testCase.description} (${column.title} - ${column.type})...`);
        
        try {
          // Тестируем changeColumnValue
          console.log('  Тест changeColumnValue:');
          const result1 = await mondayTool._call({
            action: 'changeColumnValue',
            boardId: testBoard.id,
            itemId: createdItem.id,
            columnId: column.id,
            value: testCase.value
          });
          console.log('  ✅ changeColumnValue успешно');

          // Тестируем changeSimpleColumnValue для простых типов
          if (['text', 'numbers'].includes(testCase.type)) {
            console.log('  Тест changeSimpleColumnValue:');
            const result2 = await mondayTool._call({
              action: 'changeSimpleColumnValue',
              boardId: testBoard.id,
              itemId: createdItem.id,
              columnId: column.id,
              value: testCase.value
            });
            console.log('  ✅ changeSimpleColumnValue успешно');
          }

        } catch (error) {
          console.log(`  ❌ Ошибка: ${error.message}`);
        }
      }
    }

    // 5. Тестируем множественное обновление колонок
    console.log('\n📋 Шаг 5: Тестирование множественного обновления колонок...');
    
    const multipleUpdates = {};
    // Используем initialColumnsForMultipleUpdate для шага 5
    const columnsToUpdate = initialColumnsForMultipleUpdate.slice(0, 3);

    if (columnsToUpdate.length === 0 && columns.length > 0) {
      // Если на доске изначально не было колонок, но они были созданы в шаге 4,
      // попробуем использовать их для множественного обновления.
      console.log('⚠️ Для множественного обновления используем колонки, созданные в шаге 4, так как изначально их не было.');
      columns.slice(0,3).forEach(c => {
         if (c && c.id) { // Убедимся, что у колонки есть ID
            switch(c.type) {
                case 'text':
                    multipleUpdates[c.id] = 'Multiple update text';
                    break;
                case 'numbers':
                    multipleUpdates[c.id] = '42';
                    break;
                case 'status':
                    multipleUpdates[c.id] = { index: 1 }; // Пример для статуса
                    break;
                // Добавьте другие типы по необходимости
                default:
                    // Попытка присвоить простое строковое значение для неизвестных типов
                    multipleUpdates[c.id] = 'Default value for ' + c.type;
            }
        }
      });
    } else {
      columnsToUpdate.forEach(c => {
        if (c && c.id) { // Убедимся, что у колонки есть ID
            switch(c.type) {
                case 'text':
                    multipleUpdates[c.id] = 'Multiple update text';
                    break;
                case 'numbers':
                    multipleUpdates[c.id] = '42';
                    break;
                case 'status':
                    // Для колонки статуса нужно указать ID или индекс метки
                    // Это значение { index: 1 } может не подойти для всех досок.
                    // Лучше получать доступные метки и использовать их.
                    // Пока оставим так для простоты, но это может быть источником ошибки.
                    multipleUpdates[c.id] = { index: 1 }; 
                    break;
                // Добавьте другие типы по необходимости
                default:
                    // Попытка присвоить простое строковое значение для неизвестных типов
                    multipleUpdates[c.id] = 'Default value for ' + c.type;
            }
        }
      });
    }

    if (Object.keys(multipleUpdates).length > 0) {
      try {
        const result = await mondayTool._call({
          action: 'changeMultipleColumnValues',
          boardId: testBoard.id,
          itemId: createdItem.id,
          columnValues: multipleUpdates // Это поле должно быть объектом { columnId: value, ... }
        });
        console.log('✅ Множественное обновление успешно');
      } catch (error) {
        console.log(`❌ Ошибка множественного обновления: ${error.message}`);
      }
    } else {
      console.log('⚠️ Нет доступных колонок для множественного обновления.');
    }

    console.log('\n🎉 Тестирование завершено!');

  } catch (error) {
    console.error('❌ Ошибка при тестировании:', error);
  }
}

// Запускаем тест
// testColumnUpdates().catch(console.error);

async function createAndFillItemOnSpecificBoard(targetBoardId, newItemName = 'New Fully Populated Item') {
  console.log(`🚀 Попытка создать и заполнить элемент на доске ID: ${targetBoardId}...\n`);

  const apiKey = process.env.MONDAY_API_KEY;
  if (!apiKey) {
    console.error('❌ Установите переменную окружения MONDAY_API_KEY');
    return;
  }

  const mondayTool = new MondayTool({ MONDAY_API_KEY: apiKey });
  const mondayDomain = process.env.MONDAY_DOMAIN || 'retailbox-company';

  try {
    // 1. Проверяем доступность доски (опционально, но полезно)
    console.log('📋 Шаг 1: Проверка доступности доски...');
    let boardDetailsResult;
    try {
      boardDetailsResult = await mondayTool._call({
        action: 'getBoard',
        boardId: targetBoardId,
      });
    } catch (e) {
        console.error(`❌ Ошибка при доступе к доске ${targetBoardId}: ${e.message}`);
        return;
    }
    const boardDetails = JSON.parse(boardDetailsResult);
    if (!boardDetails.success || !boardDetails.data) {
        console.error(`❌ Не удалось получить информацию о доске ${targetBoardId}. Ответ API: ${boardDetailsResult}`);
        return;
    }
    console.log(`✅ Доска "${boardDetails.data.name}" (ID: ${targetBoardId}) доступна.`);


    // 2. Создаем новый элемент
    console.log('\n📋 Шаг 2: Создание нового элемента...');
    const createResult = await mondayTool._call({
      action: 'createItem',
      boardId: targetBoardId,
      itemName: newItemName,
    });
    const createdItemResponse = JSON.parse(createResult);
    if (!createdItemResponse.success || !createdItemResponse.data || !createdItemResponse.data.id) {
      console.error(`❌ Не удалось создать элемент на доске ${targetBoardId}. Ответ API: ${createResult}`);
      return;
    }
    const createdItem = createdItemResponse.data;
    console.log(`✅ Создан элемент: "${createdItem.name}" (ID: ${createdItem.id})`);
    const itemLink = `https://${mondayDomain}.monday.com/boards/${targetBoardId}/pulses/${createdItem.id}`;
    console.log(`🔗 Прямая ссылка на новый элемент: ${itemLink}`);

    // 3. Получаем информацию о колонках на доске
    console.log('\n📋 Шаг 3: Получение информации о колонках доски...');
    const columnsResult = await mondayTool._call({
      action: 'getColumnsInfo',
      boardId: targetBoardId,
    });
    const columnsData = JSON.parse(columnsResult);
    if (!columnsData.success || !columnsData.data) {
      console.error(`❌ Не удалось получить колонки для доски ${targetBoardId}. Ответ API: ${columnsResult}`);
      return;
    }
    const columns = columnsData.data;
    console.log(`✅ Найдено колонок на доске: ${columns.length}`);
    if (columns.length === 0) {
      console.log('⚠️ На доске нет колонок для заполнения.');
      console.log('\n🎉 Операция завершена (элемент создан, но нет колонок для заполнения).');
      return;
    }

    // 4. Формируем значения для всех возможных колонок
    console.log('\n📋 Шаг 4: Формирование значений для колонок...');
    const columnValuesToSet = {};
    const currentDate = new Date();
    const dateForMonday = { date: currentDate.toISOString().split('T')[0] }; // YYYY-MM-DD
    const timeForMonday = { time: currentDate.toTimeString().split(' ')[0].substring(0, 5) }; // HH:MM

    // --- НАЧАЛО: ИЗМЕНЕНИЕ ДЛЯ ОТЛАДКИ ---
    let foundTextColumnForDebug = false;
    let debugColumnId = null;
    let debugTextValue = null;

    for (const column of columns) {
      // Ищем ту самую колонку, которая захардкожена в MondayTool.js
      if (column.id === 'text_mkpdggrx') { 
        debugColumnId = column.id;
        debugTextValue = `This value will be ignored by MondayTool.js ${new Date().toLocaleTimeString()}`;
        console.log(`  [ОТЛАДКА] Найдена целевая колонка для хардкоженного теста: "${column.title}" (ID: ${debugColumnId}).`);
        foundTextColumnForDebug = true;
        break; 
      }
    }

    if (foundTextColumnForDebug) {
      console.log(`\n  [ОТЛАДКА] Попытка обновить колонку ID ${debugColumnId} через changeMultipleColumnValues (с хардкоженным JSON в MondayTool.js)...`);
      const multiUpdateResult = await mondayTool._call({
        action: 'changeMultipleColumnValues', // Используем множественное обновление
        boardId: targetBoardId,
        itemId: createdItem.id,
        columnValues: { [debugColumnId]: debugTextValue } // Это значение будет проигнорировано в MondayTool.js
      });
      const multiUpdateResponse = JSON.parse(multiUpdateResult);
      if (multiUpdateResponse.success) {
        console.log('  [ОТЛАДКА] ✅ Множественное обновление changeMultipleColumnValues (с хардкоженным JSON) успешно.');
      } else {
        console.error(`  [ОТЛАДКА] ❌ Ошибка при множественном обновлении changeMultipleColumnValues (с хардкоженным JSON). Ответ API: ${multiUpdateResult}`);
      }
    } else {
      console.log('  [ОТЛАДКА] Не найдена целевая колонка text_mkpdggrx для хардкоженного теста.');
    }
    // --- КОНЕЦ: ИЗМЕНЕНИЕ ДЛЯ ОТЛАДКИ ---

    /* // --- НАЧАЛО: ВРЕМЕННО ОТКЛЮЧЕННЫЙ КОД ОДИНОЧНОГО ОБНОВЛЕНИЯ ---
    if (foundTextColumnForDebug) {
      console.log(`\n  [ОТЛАДКА] Попытка обновить колонку ID ${debugColumnId} через changeColumnValue...`);
      const singleUpdateResult = await mondayTool._call({
        action: 'changeColumnValue', // Используем одиночное обновление
        boardId: targetBoardId,
        itemId: createdItem.id,
        columnId: debugColumnId,
        value: debugTextValue 
      });
      const singleUpdateResponse = JSON.parse(singleUpdateResult);
      if (singleUpdateResponse.success) {
        console.log('  [ОТЛАДКА] ✅ Одиночное обновление changeColumnValue успешно.');
      } else {
        console.error(`  [ОТЛАДКА] ❌ Ошибка при одиночном обновлении changeColumnValue. Ответ API: ${singleUpdateResult}`);
      }
    } else {
      console.log('  [ОТЛАДКА] Не найдена простая текстовая колонка для отладочного одиночного обновления.');
    }
    */ // --- КОНЕЦ: ВРЕМЕННО ОТКЛЮЧЕННЫЙ КОД ОДИНОЧНОГО ОБНОВЛЕНИЯ ---

    /* // --- НАЧАЛО: ВРЕМЕННО ОТКЛЮЧЕННЫЙ КОД ЗАПОЛНЕНИЯ ВСЕХ КОЛОНОК ---
    for (const column of columns) {
      if (column.id && column.type) {
        // Пропускаем некоторые типы колонок, которые не устанавливаются напрямую или требуют сложной логики
        if (['formula', 'auto_number', 'lookup', 'subtasks', 'board-relation', 'integration', 'last_updated', 'creation_log'].includes(column.type)) {
          console.log(`  ⚪️ Колонка "${column.title}" (ID: ${column.id}, Тип: ${column.type}) будет пропущена (не поддерживается прямое заполнение).`);
          continue;
        }
        
        let valueToSet;
        switch (column.type) {
          case 'text':
          case 'long-text':
            valueToSet = `Тест для "${column.title}" - ${new Date().toLocaleTimeString()}`;
            break;
          case 'numbers':
            valueToSet = Math.floor(Math.random() * 1000) + 1;
            break;
          case 'status':
            try {
                const settings = column.settings_str ? JSON.parse(column.settings_str) : null;
                if (settings && settings.labels && Object.keys(settings.labels).length > 0) {
                    const firstLabelIndexKey = Object.keys(settings.labels)[0]; 
                    const firstLabelText = settings.labels[firstLabelIndexKey];     

                    if (column.id === 'status') { 
                        valueToSet = { label: firstLabelText };
                        console.log(`  🔵 Для главной колонки статуса "${column.title}" (ID: ${column.id}) будет использована метка: "${firstLabelText}"`);
                    } else {
                        valueToSet = { index: parseInt(firstLabelIndexKey, 10) };
                        console.log(`  🔵 Для кастомной колонки статуса "${column.title}" (ID: ${column.id}) будет использован индекс: ${firstLabelIndexKey}`);
                    }
                } else if (settings && settings.labels_colors && settings.labels_colors.length > 0) {
                    const labelConfig = settings.labels_colors[0];
                    valueToSet = { index: labelConfig.id }; 
                    console.log(`  🔵 Для статуса "${column.title}" (ID: ${column.id}) по labels_colors выбран индекс: ${labelConfig.id}`);
                } else {
                    valueToSet = { index: 0 }; 
                    console.warn(`  🟡 Не удалось определить конкретные статусы для "${column.title}" (ID: ${column.id}). Используется { index: 0 }.`);
                }
            } catch (e) {
                console.warn(`  🟡 Ошибка при парсинге настроек статуса для "${column.title}" (ID: ${column.id}). Используется { index: 0 }. Ошибка: ${e.message}`);
                valueToSet = { index: 0 };
            }
            break;
          case 'date':
            valueToSet = dateForMonday;
            break;
          case 'timeline':
            const tomorrow = new Date(currentDate);
            tomorrow.setDate(currentDate.getDate() + 1);
            valueToSet = { 
              from: currentDate.toISOString().split('T')[0], 
              to: tomorrow.toISOString().split('T')[0] 
            };
            break;
          case 'checkbox':
            valueToSet = { checked: true };
            break;
          case 'multiple-person': 
          case 'person':
             console.log(`  ⚪️ Колонка "${column.title}" (ID: ${column.id}, Тип: ${column.type}) будет пропущена (требуются ID пользователей).`);
            continue; 
          case 'world_clock': 
             console.log(`  ⚪️ Колонка "${column.title}" (ID: ${column.id}, Тип: ${column.type}) будет пропущена.`);
            continue; 
          case 'link':
            valueToSet = { url: 'https://monday.com', text: 'Monday.com Link' };
            break;
          case 'dropdown':
             try {
                const settings = column.settings_str ? JSON.parse(column.settings_str) : null;
                if (settings && settings.labels && settings.labels.length > 0) {
                    valueToSet = { ids: [settings.labels[0].id] , changed_at: new Date().toISOString() }; 
                     console.log(`  🔵 Для dropdown "${column.title}" выбрана первая опция ID: ${settings.labels[0].id}`);
                } else {
                    console.warn(`  🟡 Не удалось определить опции для dropdown "${column.title}". Пропускается.`);
                    continue;
                }
            } catch (e) {
                console.warn(`  🟡 Ошибка парсинга настроек dropdown для "${column.title}": ${e.message}. Пропускается.`);
                continue;
            }
            break;
          case 'email':
            valueToSet = { email: 'test@example.com', text: 'Test Email' };
            break;
          case 'phone':
            valueToSet = { phone: '+1234567890', countryShortName: 'US' };
            break;
          case 'rating':
             valueToSet = { rating: Math.floor(Math.random() * 5) + 1 }; 
            break;
          case 'hour': 
            valueToSet = timeForMonday;
            break;
          case 'item_id': 
             console.log(`  ⚪️ Колонка "${column.title}" (ID: ${column.id}, Тип: ${column.type}) будет пропущена (ID элемента).`);
            continue;
          case 'week':
            valueToSet = { week: { year: currentDate.getFullYear(), week: Math.floor(currentDate.getDate() / 7) } };
            break;
          default:
            console.log(`  🟡 Неизвестный или неподдерживаемый тип колонки "${column.title}" (ID: ${column.id}, Тип: ${column.type}). Попытка установить текстовое значение.`);
            valueToSet = `Авто-значение для типа ${column.type}`;
            break;
        }
        if (valueToSet !== undefined) {
            console.log(`  ➡️ Для колонки "${column.title}" (ID: ${column.id}, Тип: ${column.type}) будет установлено:`, JSON.stringify(valueToSet));
            columnValuesToSet[column.id] = valueToSet;
        }
      }
    }
    */ // --- КОНЕЦ: ВРЕМЕННО ОТКЛЮЧЕННЫЙ КОД ЗАПОЛНЕНИЯ ВСЕХ КОЛОНОК ---

    // 5. Обновляем элемент значениями колонок
    if (Object.keys(columnValuesToSet).length > 0) {
      console.log('\n📋 Шаг 5: Обновление элемента всеми сформированными значениями...');
      const updateResult = await mondayTool._call({
        action: 'changeMultipleColumnValues',
        boardId: targetBoardId,
        itemId: createdItem.id,
        columnValues: columnValuesToSet,
      });
      const updateResponse = JSON.parse(updateResult);
      if (updateResponse.success) {
        console.log('✅ Элемент успешно обновлен всеми возможными значениями.');
      } else {
        console.error(`❌ Ошибка при обновлении элемента значениями колонок. Ответ API: ${updateResult}`);
      }
    } else {
      console.log('⚠️ Нет колонок для установки значений (кроме пропущенных).');
    }

    console.log('\n🎉 Операция завершена!');
    console.log(`🔗 Проверьте элемент по ссылке: ${itemLink}`);

  } catch (error) {
    console.error('❌ Глобальная ошибка при выполнении операции:', error.message, error.stack);
  }
}

// Убедимся, что вызывается ТОЛЬКО НУЖНАЯ ФУНКЦИЯ:
// testColumnUpdates().catch(console.error); // Старый вызов ЗАКОММЕНТИРОВАН

const specificBoardIdToFill = '930298588'; 
createAndFillItemOnSpecificBoard(specificBoardIdToFill, `Test Item Full Fill ${new Date().toISOString()}`); 