// Вспомогательные функции для monday.com Tool
const { logger } = require('~/config');

/**
 * Форматирует ответ API в удобочитаемый формат
 */
function formatResponse(action, data, success = true, error = null) {
  return {
    success,
    action,
    data,
    error,
    timestamp: new Date().toISOString()
  };
}

/**
 * Валидирует ID доски
 */
function validateBoardId(boardId) {
  if (!boardId) {
    throw new Error('Board ID is required');
  }
  
  const id = parseInt(boardId);
  if (isNaN(id) || id <= 0) {
    throw new Error('Board ID must be a positive number');
  }
  
  return id;
}

/**
 * Валидирует ID элемента
 */
function validateItemId(itemId) {
  if (!itemId) {
    throw new Error('Item ID is required');
  }
  
  const id = parseInt(itemId);
  if (isNaN(id) || id <= 0) {
    throw new Error('Item ID must be a positive number');
  }
  
  return id;
}

/**
 * Обрабатывает ошибки GraphQL
 */
function handleGraphQLErrors(errors) {
  if (!errors || !Array.isArray(errors)) {
    return 'Unknown GraphQL error';
  }

  return errors.map(error => {
    let message = error.message || 'Unknown error';
    
    // Добавляем контекст для общих ошибок
    if (message.includes('You do not have permission')) {
      message += ' - Check your API key permissions';
    } else if (message.includes('not found')) {
      message += ' - Verify the ID exists and you have access';
    } else if (message.includes('Invalid')) {
      message += ' - Check the provided parameters format';
    }
    
    return message;
  }).join('; ');
}

/**
 * Логирует операцию
 */
function logOperation(action, params, success = true, error = null) {
  const logData = {
    action,
    params: Object.keys(params || {}),
    success,
    timestamp: new Date().toISOString()
  };

  if (error) {
    logData.error = error.message || error;
    logger.error('[MondayTool] Operation failed', logData);
  } else {
    logger.debug('[MondayTool] Operation completed', logData);
  }
}

/**
 * Создает базовые значения колонок для различных типов
 */
function createColumnValues(type, value) {
  switch (type) {
    case 'text':
      return value;
    case 'status':
      return { label: value };
    case 'date':
      return { date: value };
    case 'people':
      return { personsAndTeams: Array.isArray(value) ? value : [value] };
    case 'numbers':
      return parseFloat(value) || 0;
    case 'checkbox':
      return { checked: Boolean(value) };
    case 'timeline':
      return {
        from: value.from,
        to: value.to
      };
    default:
      return value;
  }
}

/**
 * Парсит настройки колонки из JSON строки
 */
function parseColumnSettings(settingsStr) {
  try {
    return JSON.parse(settingsStr || '{}');
  } catch (error) {
    logger.warn('[MondayTool] Failed to parse column settings', { settingsStr, error: error.message });
    return {};
  }
}

/**
 * Получает допустимые значения для статусной колонки
 */
function getStatusOptions(settings) {
  try {
    const labels = settings.labels || {};
    return Object.keys(labels).map(key => ({
      id: key,
      label: labels[key],
      color: settings.labels_colors?.[key] || '#000000'
    }));
  } catch (error) {
    logger.warn('[MondayTool] Failed to parse status options', { settings, error: error.message });
    return [];
  }
}

/**
 * Форматирует дату в формат monday.com
 */
function formatDateForMonday(date) {
  if (!date) return null;
  
  try {
    const d = new Date(date);
    return d.toISOString().split('T')[0]; // YYYY-MM-DD format
  } catch (error) {
    logger.warn('[MondayTool] Invalid date format', { date, error: error.message });
    return null;
  }
}

/**
 * Обрабатывает пагинацию
 */
function calculatePagination(page = 1, limit = 25) {
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 25));
  const offset = (pageNum - 1) * limitNum;
  
  return {
    page: pageNum,
    limit: limitNum,
    offset
  };
}

/**
 * Извлекает полезную информацию из элемента доски
 */
function extractItemInfo(item) {
  if (!item) return null;

  const info = {
    id: item.id,
    name: item.name,
    state: item.state,
    group: item.group?.title || 'No Group',
    created_at: item.created_at,
    updated_at: item.updated_at
  };

  // Добавляем значения колонок в удобочитаемом формате
  if (item.column_values) {
    info.columns = {};
    item.column_values.forEach(col => {
      if (col.text) {
        info.columns[col.title] = col.text;
      }
    });
  }

  return info;
}

module.exports = {
  formatResponse,
  validateBoardId,
  validateItemId,
  handleGraphQLErrors,
  logOperation,
  createColumnValues,
  parseColumnSettings,
  getStatusOptions,
  formatDateForMonday,
  calculatePagination,
  extractItemInfo
};
