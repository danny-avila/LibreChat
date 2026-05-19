import { REPORT_CONFIG } from '../../store/reports';

const appendDefaultEndDate = (params: URLSearchParams) => {
  const today = new Date().toISOString().split('T')[0];
  params.append('end_date', today);
};

/** Alinha parâmetros de data com o backend (build_created_at_match). */
const appendReportDateParams = (
  params: URLSearchParams,
  filters: { startDate?: string; endDate?: string },
) => {
  const startDate = filters.startDate?.trim();
  const endDate = filters.endDate?.trim();

  if (startDate) {
    params.append('start_date', startDate);
  }
  if (endDate) {
    params.append('end_date', endDate);
  } else if (startDate) {
    appendDefaultEndDate(params);
  }
  // Sem start/end: não envia → API usa últimos 30 dias
};

const appendLimitParam = (params: URLSearchParams, filters: { limit?: number | null }) => {
  if ('limit' in filters && filters.limit === null) {
    return;
  }
  const limit = 'limit' in filters ? filters.limit : 10;
  if (limit !== undefined && limit !== null) {
    params.append('limit', limit.toString());
  }
};

const fetchUsageCostData = async (filters: any) => {
  try {
    const params = new URLSearchParams();

    // Adiciona filtros como parâmetros da URL
    if (filters.user && filters.user.trim()) {
      params.append('user', filters.user.trim());
      params.append('search_by', 'username'); // ou 'name' dependendo do que você quer buscar
    }

    appendReportDateParams(params, filters);

    const url = `${REPORT_CONFIG.URL_BASE}${REPORT_CONFIG.ENDPOINTS.USAGE_COST}${params.toString() ? '?' + params.toString() : ''}`;

    // Primeiro testa se a rota existe
    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Erro HTTP ${response.status}:`, errorText);

      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const responseText = await response.text();
      console.error('Resposta não é JSON:', responseText);
      throw new Error('Resposta da API não é JSON válido');
    }

    const data = await response.json();

    // Mapeia dados da API (nomes antigos) para novos nomes se necessário
    if (Array.isArray(data) && data.length > 0) {
      const firstItem = data[0];

      const hasNewFormat = ['QUESTIONS', 'QUESTIONS custo', 'ANSWERS', 'ANSWERS custo', 'date'].every(
        (field) => Object.prototype.hasOwnProperty.call(firstItem, field),
      );

      if (hasNewFormat) {
        return data;
      }

      const hasOldFormat = ['IA msgs', 'IA custo', 'USER msgs', 'USER custo', 'date'].every(
        (field) => Object.prototype.hasOwnProperty.call(firstItem, field),
      );

      if (hasOldFormat) {
        return data.map((item) => ({
          date: item.date,
          QUESTIONS: item['USER msgs'],
          'QUESTIONS custo': item['USER custo'],
          ANSWERS: item['IA msgs'],
          'ANSWERS custo': item['IA custo'],
        }));
      }

      console.warn(
        'Dados de usage-cost sem formato esperado. Campos:',
        Object.keys(firstItem),
      );
      return [];
    }

    return data;
  } catch (error) {
    console.error('Erro ao buscar dados de uso e custo:', error);

    // Se for erro de rede, mostrar mensagem específica
    // Retorna dados mock como fallback
    return [];
  }
};

const fetchTopUsersVolumeData = async (filters: any) => {
  try {
    const params = new URLSearchParams();

    if (filters.user && filters.user.trim()) {
      params.append('user', filters.user.trim());
      params.append('search_by', 'username');
    }

    appendReportDateParams(params, filters);

    appendLimitParam(params, filters);

    const url = `${REPORT_CONFIG.URL_BASE}${REPORT_CONFIG.ENDPOINTS.TOP_USERS_VOLUME}${params.toString() ? '?' + params.toString() : ''}`;

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Erro HTTP ${response.status}:`, errorText);
      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Erro ao buscar top users volume:', error);
    return [];
  }
};

const fetchTopUsersCostData = async (filters: any) => {
  try {
    const params = new URLSearchParams();

    if (filters.user && filters.user.trim()) {
      params.append('user', filters.user.trim());
      params.append('search_by', 'username');
    }

    appendReportDateParams(params, filters);

    appendLimitParam(params, filters);

    const url = `${REPORT_CONFIG.URL_BASE}${REPORT_CONFIG.ENDPOINTS.TOP_USERS_COST}${params.toString() ? '?' + params.toString() : ''}`;

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Erro HTTP ${response.status}:`, errorText);
      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Erro ao buscar top users cost:', error);
    return [];
  }
};

const fetchTopModelsData = async (filters: any) => {
  try {

    const params = new URLSearchParams();

    if (filters.user && filters.user.trim()) {
      params.append('user', filters.user.trim());
      params.append('search_by', 'username');
    }

    appendReportDateParams(params, filters);

    appendLimitParam(params, filters);

    const url = `${REPORT_CONFIG.URL_BASE}${REPORT_CONFIG.ENDPOINTS.TOP_MODELS}${params.toString() ? '?' + params.toString() : ''}`;

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Erro HTTP ${response.status}:`, errorText);
      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    try {
      const descriptionsResponse = await fetch('/api/models-descriptions', {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      });

      const descriptions = descriptionsResponse.ok
        ? await descriptionsResponse.json()
        : {};
      for (const model of data) {
        const modelId = model.name;
        model.modelId = modelId;
        model.name = descriptions[modelId]?.name || modelId;
      }
    } catch {
      for (const model of data) {
        model.modelId = model.name;
      }
    }

    return data;

  } catch (error) {
    console.error('Erro ao buscar top models:', error);
    return [];
  }
};

const fetchAvailableModels = async () => {
  try {

    const response = await fetch(
      `${REPORT_CONFIG.URL_BASE}${REPORT_CONFIG.ENDPOINTS.AVAILABLE_MODELS}`,
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Erro HTTP ${response.status}:`, errorText);
      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Erro ao buscar modelos disponíveis:', error);
    return [];
  }
};

const fetchKPIsData = async (filters: any) => {
  try {
    const params = new URLSearchParams();

    appendReportDateParams(params, filters);

    const url = `${REPORT_CONFIG.URL_BASE}${REPORT_CONFIG.ENDPOINTS.KPIS}${params.toString() ? '?' + params.toString() : ''}`;

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Erro HTTP ${response.status}:`, errorText);
      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Erro ao buscar KPIs:', error);
    return {
      totalCost: 0,
      newUsers: 0,
      activeAccounts: 0
    };
  }
};

const fetchUserEfficiencyData = async (filters: any) => {
  try {
    const params = new URLSearchParams();

    if (filters.user && filters.user.trim()) {
      params.append('user', filters.user.trim());
      params.append('search_by', 'username');
    }

    appendReportDateParams(params, filters);

    appendLimitParam(params, filters);

    const url = `${REPORT_CONFIG.URL_BASE}${REPORT_CONFIG.ENDPOINTS.USER_EFFICIENCY}${params.toString() ? '?' + params.toString() : ''}`;

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Erro HTTP ${response.status}:`, errorText);
      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Erro ao buscar user efficiency:', error);
    return [];
  }
};

const fetchTopCostCentersVolumeData = async (filters: any) => {
  try {
    const params = new URLSearchParams();

    if (filters.user && filters.user.trim()) {
      params.append('user', filters.user.trim());
      params.append('search_by', 'username');
    }

    appendReportDateParams(params, filters);

    appendLimitParam(params, filters);

    const url = `${REPORT_CONFIG.URL_BASE}${REPORT_CONFIG.ENDPOINTS.TOP_COST_CENTERS_VOLUME}${params.toString() ? '?' + params.toString() : ''}`;

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Erro HTTP ${response.status}:`, errorText);
      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Erro ao buscar top cost centers volume:', error);
    return [];
  }
};

const fetchTopCostCentersCostData = async (filters: any) => {
  try {
    const params = new URLSearchParams();

    if (filters.user && filters.user.trim()) {
      params.append('user', filters.user.trim());
      params.append('search_by', 'username');
    }

    appendReportDateParams(params, filters);

    appendLimitParam(params, filters);

    const url = `${REPORT_CONFIG.URL_BASE}${REPORT_CONFIG.ENDPOINTS.TOP_COST_CENTERS_COST}${params.toString() ? '?' + params.toString() : ''}`;

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Erro HTTP ${response.status}:`, errorText);
      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Erro ao buscar top cost centers cost:', error);
    return [];
  }
};

export {
  fetchAvailableModels,
  fetchKPIsData, fetchTopCostCentersCostData, fetchTopCostCentersVolumeData, fetchTopModelsData,
  fetchTopUsersCostData,
  fetchTopUsersVolumeData,
  fetchUsageCostData,
  fetchUserEfficiencyData
};

