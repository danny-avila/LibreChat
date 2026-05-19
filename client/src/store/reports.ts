import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

//==============================================================================
// 🎨 SISTEMA DE CORES - DOCUMENTAÇÃO COMPLETA
//==============================================================================
/**
 * 📚 COMO FUNCIONA O SISTEMA DE CORES:
 *
 * O sistema oferece controle granular de cores para cada tipo de gráfico.
 * Cada gráfico tem sua própria paleta de cores específica.
 *
 * 🎯 ESTRUTURA:
 * - CHART_COLORS_BY_TYPE: Define paletas específicas para cada gráfico
 * - Cada usuário/modelo recebe uma cor diferente da paleta
 * - Cores são aplicadas automaticamente via funções utilitárias
 *
 * 🔧 COMO TROCAR CORES:
 *
 * 1️⃣ TROCAR CORES DE UM GRÁFICO ESPECÍFICO:
 *    Edite o array correspondente em CHART_COLORS_BY_TYPE:
 *
 *    USER_MESSAGES: ['#nova_cor1', '#nova_cor2', '#nova_cor3', ...]
 *
 * 2️⃣ ADICIONAR MAIS CORES A UM GRÁFICO:
 *    Adicione mais hexadecimais ao array:
 *
 *    USER_MESSAGES: ['#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#nova_cor6']
 *
 * 3️⃣ CRIAR NOVA PALETA PARA NOVO GRÁFICO:
 *    - Adicione em CHART_COLORS_BY_TYPE
 *    - Crie função addColorsTo[NovoTipo] em ReportUtils
 *    - Use a função no processamento dos dados
 *
 * 📊 GRÁFICOS E SUAS PALETAS:
 *
 * ┌─────────────────────┬─────────────────────┬──────────────────┐
 * │ GRÁFICO             │ PALETA              │ FUNÇÃO UTIL      │
 * ├─────────────────────┼─────────────────────┼──────────────────┤
 * │ GraphUserMessages   │ USER_MESSAGES       │ addColorsToUsers │
 * │ GraphUserCost       │ USER_COST           │ addColorsToUsers │
 * │ GraphModelsMessage  │ MODELS_MESSAGES     │ addColorsToModel │
 * │ GraphModelsCost     │ MODELS_COST         │ addColorsToModel │
 * │ GraphUserEfficiency │ USER_EFFICIENCY     │ addColorsToUsers │
 * │ GraphMessagesCost   │ USAGE_COST_DETAILED │ getUsageCostDeta │
 * │ MainKpis           │ KPIS                │ getKPIColors     │
 * └─────────────────────┴─────────────────────┴──────────────────┘
 *
 * ⚡ IMPLEMENTAÇÃO AUTOMÁTICA:
 * - Cores são aplicadas via Cell component do Recharts
 * - Cada item (usuário/modelo) recebe uma cor diferente
 * - Cicla pelas cores se houver mais itens que cores
 *
 * 🔄 EXEMPLO DE USO:
 * ```typescript
 * // Aplicar cores automáticas aos dados
 * const usersWithColors = ReportUtils.addColorsToUsersVolume(userData);
 *
 * // No componente de gráfico
 * <Bar dataKey="Volume">
 *   {usersWithColors.map((entry, index) => (
 *     <Cell key={`cell-${index}`} fill={entry.fill} />
 *   ))}
 * </Bar>
 * ```
 *
 * 🗑️ CORES OBSOLETAS:
 * - CHART_COLORS_ALT: Marcado para remoção
 * - Props 'color' nos componentes: Removidas em favor de cores individuais
 */

//==============================================================================
// 🎨 CONFIGURAÇÕES E CONSTANTES
//==============================================================================

export const REPORT_CONFIG = {
  URL_BASE: '/api/python-tools/',
  ENDPOINTS: {
    USAGE_COST: 'reports/usage-cost',
    TOP_USERS_VOLUME: 'reports/top-users-volume',
    TOP_USERS_COST: 'reports/top-users-cost',
    TOP_MODELS: 'reports/top-models',
    KPIS: 'reports/kpis',
    USER_EFFICIENCY: 'reports/user-efficiency',
    AVAILABLE_MODELS: 'reports/available-models',
    TOP_COST_CENTERS_VOLUME: 'reports/top-cost-centers-volume',
    TOP_COST_CENTERS_COST: 'reports/top-cost-centers-cost',
  },
  // Cores gerais para fallback (mantido para compatibilidade)
  CHART_COLORS: ['#60a5fa', '#a78bfa', '#f472b6', '#4ade80', '#fbbf24', '#ef4444'],

  // 🎨 Cores específicas por tipo de gráfico - cada gráfico tem um array de cores
  CHART_COLORS_BY_TYPE: {
    // GraphMessagesCost - Gráfico principal de uso e custo (área temporal)
    USAGE_COST: ['#10b981', '#059669', '#60a5fa', '#3b82f6', '#8b5cf6'],

    // GraphUserMessages - Volume de mensagens por usuário (barras horizontais)
    USER_MESSAGES: ['#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af'],

    // GraphUserCost - Custo por usuário (barras horizontais)
    // USER_COST: ['#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d'],
    USER_COST: ['#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af'],

    // GraphModelsMessage - Volume por modelo (barras horizontais)
    MODELS_MESSAGES: ['#10b981', '#059669', '#047857', '#065f46', '#064e3b'],

    // GraphModelsCost - Custo por modelo (barras horizontais)
    MODELS_COST: ['#f59e0b', '#d97706', '#b45309', '#92400e', '#78350f'],

    // GraphUserEfficiency - Eficiência de usuários (barras horizontais)
    USER_EFFICIENCY: ['#a855f7', '#9333ea', '#7c3aed', '#6d28d9', '#5b21b6'],

    // GraphCCmessages - Volume por centro de custo (barras horizontais)
    COST_CENTERS_VOLUME: ['#ec4899', '#db2777', '#be185d', '#9d174d', '#831843'],

    // GraphCCcost - Custo por centro de custo (barras horizontais)
    // COST_CENTERS_COST: ['#06b6d4', '#0891b2', '#0e7490', '#155e75', '#164e63'],
    COST_CENTERS_COST: ['#ec4899', '#db2777', '#be185d', '#9d174d', '#831843'],

    // MainKpis - Cards de indicadores (cores para diferentes estados)
    KPIS: ['#ef4444', '#10b981', '#60a5fa', '#f59e0b', '#8b5cf6'],

    // Cores especiais para o gráfico de uso/custo (compatibilidade)
    USAGE_COST_DETAILED: {
      TOTAL_MESSAGES: '#a855f7', // Verde para total de mensagens
      QUESTIONS: '#60a5fa', // Azul para perguntas
      QUESTIONS_COST: '#3b82f6', // Azul mais escuro para custo das perguntas
      ANSWERS: '#10b981', // Verde para respostas
      ANSWERS_COST: '#059669', // Verde mais escuro para custo das respostas
    },
  },
} as const;

export const REPORT_LABELS = {
  TYPES: {
    USAGE_COST: 'Mensagens e Custo',
    TOP_USERS_VOLUME: 'Mensagens por Usuário',
    TOP_USERS_COST: 'Custos por Usuário',
    TOP_MODELS: 'Mensagens por Modelo',
    MODELS_COST: 'Custo por Modelo',
    USER_EFFICIENCY: 'Eficiência de Usuários',
    COST_CENTERS_VOLUME: 'Volume por Centro de Custo',
    COST_CENTERS_COST: 'Custo por Centro de Custo',
  },
  KPIS: {
    TOTAL_REVENUE: 'Custo Total (Período)',
    NEW_USERS: 'Novos Usuários',
    ACTIVE_USERS: 'Total Usuários Ativos',
  },
  GRAPHS: {
    TOTAL_MESSAGES: 'Total de Mensagens',
    QUESTIONS_COST: 'Custo das perguntas',
    ANSWERS_COST: 'Custo das respostas',
    IA_MESSAGES: 'Mensagens IA',
    USER_MESSAGES: 'Mensagens Usuário',
  },
  TABLES: {
    USER_MESSAGES_COST: 'Tabela de Mensagens por Usuário',
    MODELS_MESSAGES_COST: 'Tabela de Mensagens por Modelo',
    COST_CENTERS_MESSAGES_COST: 'Tabela de Mensagens por Centro de Custo',
  },
} as const;

//==============================================================================
// 📊 INTERFACES DE DADOS
//==============================================================================

// Interface unificada para dados de usuários (volume, custo, eficiência)
export interface UserData {
  username: string;
  name: string;
  Volume: number;
  Custo: number;
  Arquivos?: number;
  CostPerMessage?: number;
  costCenter?: string; // Centro de Custo do usuário
  fill?: string; // Para cores dos gráficos (igual aos modelos)
}

// Interface unificada para dados de modelos
export interface ModelData {
  name: string;
  modelId?: string; // id em transactions (estável para cores)
  Volume: number;
  Custo?: number;
  value: number; // Para gráficos radiais
  fill?: string; // Para cores dos gráficos
}

//==============================================================================
// 🎨 INTERFACES DE COMPONENTES
//==============================================================================

export interface KPICardProps {
  title: string;
  value: string;
  change: string;
  changeType?: 'positive' | 'negative';
}

export interface ChartContainerProps {
  title: string;
  children: React.ReactNode;
}

export interface ReportFilters {
  startDate: string;
  endDate: string;
  costCenter: string;
}

// Interface para componentes que precisam de props de filtros
export interface ReportFiltersProps {
  filters: ReportFilters;
  setFilter: (filterType: keyof ReportFilters, value: string) => void;
  clearFilters: () => void;
}

// Formato de dados do gráfico principal - separação QUESTIONS/ANSWERS
export interface UsageCostData {
  date: string;
  QUESTIONS: number; // Mensagens do usuário (antes USER msgs)
  'QUESTIONS custo': number; // Custo das perguntas (antes USER custo)
  ANSWERS: number; // Mensagens da IA (antes IA msgs)
  'ANSWERS custo': number; // Custo das respostas (antes IA custo)
}

// Interface para KPIs
export interface KPIData {
  totalCost: number;
  newUsers: number;
  activeAccounts: number;
}

// Compatibilidade - remover duplicatas e usar interfaces unificadas

interface ReportState {
  filters: ReportFilters;

  // Dados dos relatórios
  usageCostData: UsageCostData[];
  kpiData: KPIData | null;
  topUsersVolumeData: UserData[];
  topUsersCostData: UserData[];
  topModelsData: ModelData[];
  topModelsCostData: ModelData[];
  userEfficiencyData: UserData[];
  topCostCentersVolumeData: ModelData[];
  topCostCentersCostData: ModelData[];

  // Dados para tabelas (sem limit)
  allTopUsersVolumeData: UserData[];
  allTopUsersCostData: UserData[];
  allTopModelsData: ModelData[];
  allUserEfficiencyData: UserData[];
  allTopCostCentersVolumeData: ModelData[];
  allTopCostCentersCostData: ModelData[];

  availableModels: string[]; // Virá do banco de dados

  // Loading states
  isLoadingUsageCost: boolean;
  isLoadingKPIs: boolean;
  isLoadingTopUsers: boolean;
  isLoadingTopModels: boolean;
  isLoadingEfficiency: boolean;
  isLoadingCostCenters: boolean;

  // Obs: Loading states agora são unificados (mesmo para gráficos e tabelas)

  // Actions
  setFilter: (filterType: keyof ReportFilters, value: string) => void;
  clearFilters: () => void;
  setAvailableModels: (models: string[]) => void;

  // Actions para dados
  setUsageCostData: (data: UsageCostData[]) => void;
  setKPIData: (data: KPIData) => void;
  setTopUsersVolumeData: (data: UserData[]) => void;
  setTopUsersCostData: (data: UserData[]) => void;
  setTopModelsData: (data: ModelData[]) => void;
  setUserEfficiencyData: (data: UserData[]) => void;
  setTopCostCentersVolumeData: (data: ModelData[]) => void;
  setTopCostCentersCostData: (data: ModelData[]) => void;

  // Actions para dados de tabelas (sem limit)
  setAllTopUsersVolumeData: (data: UserData[]) => void;
  setAllTopUsersCostData: (data: UserData[]) => void;
  setAllTopModelsData: (data: ModelData[]) => void;
  setAllUserEfficiencyData: (data: UserData[]) => void;
  setAllTopCostCentersVolumeData: (data: ModelData[]) => void;
  setAllTopCostCentersCostData: (data: ModelData[]) => void;

  // Loading setters
  setLoadingUsageCost: (loading: boolean) => void;
  setLoadingKPIs: (loading: boolean) => void;
  setLoadingTopUsers: (loading: boolean) => void;
  setLoadingTopModels: (loading: boolean) => void;
  setLoadingEfficiency: (loading: boolean) => void;
  setLoadingCostCenters: (loading: boolean) => void;

  // Obs: Setters de loading agora são unificados

  // Actions assíncronas para buscar dados
  fetchUsageCostData: (filters?: Partial<ReportFilters>) => Promise<void>;
  fetchTopUsersData: (filters?: Partial<ReportFilters>) => Promise<void>;
  fetchTopModelsData: (filters?: Partial<ReportFilters>) => Promise<void>;
  fetchKPIsData: (filters?: Partial<ReportFilters>) => Promise<void>;
  fetchUserEfficiencyData: (filters?: Partial<ReportFilters>) => Promise<void>;
  fetchTopCostCentersData: (filters?: Partial<ReportFilters>) => Promise<void>;
  fetchAvailableModels: () => Promise<void>;
  fetchAllData: (filters?: Partial<ReportFilters>) => Promise<void>;
}

// Função para calcular datas padrão (primeiro dia do mês até último dia do mês)
const getDefaultDateRange = () => {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Formato YYYY-MM-DD para os inputs de data
  const startDate = firstDay.toISOString().split('T')[0];
  const endDate = lastDay.toISOString().split('T')[0];

  return { startDate, endDate };
};

const { startDate: defaultStartDate, endDate: defaultEndDate } = getDefaultDateRange();

const initialFilters: ReportFilters = {
  startDate: defaultStartDate,
  endDate: defaultEndDate,
  costCenter: '',
};

// Filtros limpos (sem data - para mostrar período todo)
const emptyFilters: ReportFilters = {
  startDate: '',
  endDate: '',
  costCenter: '',
};

export const useReportStore = create<ReportState>()(
  devtools(
    (set, get) => ({
      // Initial state
      filters: initialFilters,

      // Data
      usageCostData: [],
      kpiData: null,
      topUsersVolumeData: [],
      topUsersCostData: [],
      topModelsData: [],
      topModelsCostData: [],
      userEfficiencyData: [],
      topCostCentersVolumeData: [],
      topCostCentersCostData: [],

      // Dados para tabelas (sem limit)
      allTopUsersVolumeData: [],
      allTopUsersCostData: [],
      allTopModelsData: [],
      allUserEfficiencyData: [],
      allTopCostCentersVolumeData: [],
      allTopCostCentersCostData: [],

      availableModels: [], // Valor padrão vazio até carregar da API

      // Loading states
      isLoadingUsageCost: false,
      isLoadingKPIs: false,
      isLoadingTopUsers: false,
      isLoadingTopModels: false,
      isLoadingEfficiency: false,
      isLoadingCostCenters: false,

      // Obs: Loading states agora são unificados

      // Filter actions
      setFilter: (filterType, value) =>
        set((state) => ({
          filters: {
            ...state.filters,
            [filterType]: value,
          },
        })),

      clearFilters: () => {
        set(() => ({
          filters: emptyFilters,
        }));
      },

      setAvailableModels: (models) =>
        set(() => ({
          availableModels: models,
        })),

      // Actions para dados
      setUsageCostData: (data) =>
        set(() => ({
          usageCostData: data,
        })),

      setKPIData: (data) =>
        set(() => ({
          kpiData: data,
        })),

      setTopUsersVolumeData: (data) =>
        set(() => ({
          topUsersVolumeData: data,
        })),

      setTopUsersCostData: (data) =>
        set(() => ({
          topUsersCostData: data,
        })),

      setTopModelsData: (data) =>
        set(() => ({
          topModelsData: data,
        })),

      setUserEfficiencyData: (data) =>
        set(() => ({
          userEfficiencyData: data,
        })),

      setTopCostCentersVolumeData: (data) =>
        set(() => ({
          topCostCentersVolumeData: data,
        })),

      setTopCostCentersCostData: (data) =>
        set(() => ({
          topCostCentersCostData: data,
        })),

      // Actions para dados de tabelas (sem limit)
      setAllTopUsersVolumeData: (data) =>
        set(() => ({
          allTopUsersVolumeData: data,
        })),

      setAllTopUsersCostData: (data) =>
        set(() => ({
          allTopUsersCostData: data,
        })),

      setAllTopModelsData: (data) =>
        set(() => ({
          allTopModelsData: data,
        })),

      setAllUserEfficiencyData: (data) =>
        set(() => ({
          allUserEfficiencyData: data,
        })),

      setAllTopCostCentersVolumeData: (data) =>
        set(() => ({
          allTopCostCentersVolumeData: data,
        })),

      setAllTopCostCentersCostData: (data) =>
        set(() => ({
          allTopCostCentersCostData: data,
        })),

      // Loading setters
      setLoadingUsageCost: (loading) =>
        set(() => ({
          isLoadingUsageCost: loading,
        })),

      setLoadingKPIs: (loading) =>
        set(() => ({
          isLoadingKPIs: loading,
        })),

      setLoadingTopUsers: (loading) =>
        set(() => ({
          isLoadingTopUsers: loading,
        })),

      setLoadingTopModels: (loading) =>
        set(() => ({
          isLoadingTopModels: loading,
        })),

      setLoadingEfficiency: (loading) =>
        set(() => ({
          isLoadingEfficiency: loading,
        })),

      setLoadingCostCenters: (loading) =>
        set(() => ({
          isLoadingCostCenters: loading,
        })),

      // ✅ REMOÇÃO: Loading setters das tabelas não são mais necessários

      // Actions assíncronas para buscar dados
      fetchUsageCostData: async (customFilters) => {
        const { fetchUsageCostData } = await import('../data-provider/Reports/reportsApi');
        set({ isLoadingUsageCost: true });
        try {
          const currentFilters = { ...get().filters, ...customFilters };
          const data = await fetchUsageCostData(currentFilters);
          set({ usageCostData: data });
        } catch (error) {
          console.error('Erro ao buscar dados de uso e custo:', error);
          set({ usageCostData: [] });
        } finally {
          set({ isLoadingUsageCost: false });
        }
      },

      fetchTopUsersData: async (customFilters) => {
        const { fetchTopUsersVolumeData, fetchTopUsersCostData } = await import(
          '../data-provider/Reports/reportsApi'
        );
        set({ isLoadingTopUsers: true });
        try {
          const currentFilters = { ...get().filters, ...customFilters };
          // Busca TODOS os dados (sem limit)
          const filtersWithoutLimit = { ...currentFilters, limit: null };

          const [allVolumeData, allCostData] = await Promise.all([
            fetchTopUsersVolumeData(filtersWithoutLimit),
            fetchTopUsersCostData(filtersWithoutLimit),
          ]);

          const sortedVolume = [...allVolumeData].sort((a, b) => b.Volume - a.Volume);
          const sortedCost = [...allCostData].sort((a, b) => b.Custo - a.Custo);

          set({
            topUsersVolumeData: ReportUtils.addColorsToUsersVolume(sortedVolume.slice(0, 10)),
            topUsersCostData: ReportUtils.addColorsToUsersCost(sortedCost.slice(0, 10)),
            allTopUsersVolumeData: sortedVolume,
            allTopUsersCostData: sortedCost,
          });
        } catch (error) {
          console.error('Erro ao buscar dados de top users:', error);
          set({
            topUsersVolumeData: [],
            topUsersCostData: [],
            allTopUsersVolumeData: [],
            allTopUsersCostData: [],
          });
        } finally {
          set({ isLoadingTopUsers: false });
        }
      },

      fetchTopModelsData: async (customFilters) => {
        const { fetchTopModelsData } = await import('../data-provider/Reports/reportsApi');
        set({ isLoadingTopModels: true });
        try {
          const currentFilters = { ...get().filters, ...customFilters };
          // Busca TODOS os dados (sem limit)
          const filtersWithoutLimit = { ...currentFilters, limit: null };

          const allData = await fetchTopModelsData(filtersWithoutLimit);

          const sortedByVolume = [...allData].sort((a, b) => b.Volume - a.Volume);
          const sortedByCost = [...allData]
            .filter((m) => (m.Custo ?? 0) > 0)
            .sort((a, b) => (b.Custo ?? 0) - (a.Custo ?? 0));

          set({
            topModelsData: ReportUtils.addColorsToModels(
              sortedByVolume.slice(0, 10),
              'MODELS_MESSAGES',
            ),
            topModelsCostData: ReportUtils.addColorsToModels(
              sortedByCost.slice(0, 10),
              'MODELS_COST',
            ),
            allTopModelsData: ReportUtils.addColorsToModels(sortedByVolume, 'MODELS_MESSAGES'),
          });
        } catch (error) {
          console.error('Erro ao buscar dados de top models:', error);
          set({
            topModelsData: [],
            topModelsCostData: [],
            allTopModelsData: [],
          });
        } finally {
          set({ isLoadingTopModels: false });
        }
      },

      fetchKPIsData: async (customFilters) => {
        const { fetchKPIsData } = await import('../data-provider/Reports/reportsApi');
        set({ isLoadingKPIs: true });
        try {
          const currentFilters = { ...get().filters, ...customFilters };
          const data = await fetchKPIsData(currentFilters);
          set({ kpiData: data });
        } catch (error) {
          console.error('Erro ao buscar KPIs:', error);
          set({ kpiData: { totalCost: 0, newUsers: 0, activeAccounts: 0 } });
        } finally {
          set({ isLoadingKPIs: false });
        }
      },

      fetchUserEfficiencyData: async (customFilters) => {
        const { fetchUserEfficiencyData } = await import('../data-provider/Reports/reportsApi');
        set({ isLoadingEfficiency: true });
        try {
          const currentFilters = { ...get().filters, ...customFilters };
          // Busca TODOS os dados (sem limit)
          const filtersWithoutLimit = { ...currentFilters, limit: null };

          const allData = await fetchUserEfficiencyData(filtersWithoutLimit);
          const dataTop10 = allData.slice(0, 10);

          set({
            userEfficiencyData: ReportUtils.addColorsToUsersEfficiency(dataTop10),
            allUserEfficiencyData: allData,
          });
        } catch (error) {
          console.error('Erro ao buscar user efficiency:', error);
          set({
            userEfficiencyData: [],
            allUserEfficiencyData: [],
          });
        } finally {
          set({ isLoadingEfficiency: false });
        }
      },

      fetchTopCostCentersData: async (customFilters) => {
        const { fetchTopCostCentersVolumeData, fetchTopCostCentersCostData } = await import(
          '../data-provider/Reports/reportsApi'
        );
        set({ isLoadingCostCenters: true });
        try {
          const currentFilters = { ...get().filters, ...customFilters };
          // Busca TODOS os dados (sem limit)
          const filtersWithoutLimit = { ...currentFilters, limit: null };

          const [allVolumeData, allCostData] = await Promise.all([
            fetchTopCostCentersVolumeData(filtersWithoutLimit),
            fetchTopCostCentersCostData(filtersWithoutLimit),
          ]);

          const sortedVolume = [...allVolumeData].sort((a, b) => b.Volume - a.Volume);
          const sortedCost = [...allCostData].sort((a, b) => (b.Custo ?? 0) - (a.Custo ?? 0));

          set({
            topCostCentersVolumeData: ReportUtils.addColorsToCostCentersVolume(
              sortedVolume.slice(0, 10),
            ),
            topCostCentersCostData: ReportUtils.addColorsToCostCentersCost(sortedCost.slice(0, 10)),
            allTopCostCentersVolumeData: sortedVolume,
            allTopCostCentersCostData: sortedCost,
          });
        } catch (error) {
          console.error('Erro ao buscar dados de centros de custo:', error);
          set({
            topCostCentersVolumeData: [],
            topCostCentersCostData: [],
            allTopCostCentersVolumeData: [],
            allTopCostCentersCostData: [],
          });
        } finally {
          set({ isLoadingCostCenters: false });
        }
      },

      fetchAvailableModels: async () => {
        const { fetchAvailableModels } = await import('../data-provider/Reports/reportsApi');
        try {
          const models = await fetchAvailableModels();
          if (models && models.length > 0) {
            set({ availableModels: models });
          }
        } catch (error) {
          console.error('Erro ao buscar modelos disponíveis:', error);
          // Mantém os modelos padrão em caso de erro
        }
      },

      fetchAllData: async (customFilters) => {
        const currentFilters = { ...get().filters, ...customFilters };

        await Promise.all([
          get().fetchUsageCostData(currentFilters),
          get().fetchTopUsersData(currentFilters),
          get().fetchTopModelsData(currentFilters),
          get().fetchKPIsData(currentFilters),
          get().fetchUserEfficiencyData(currentFilters),
          get().fetchTopCostCentersData(currentFilters),
        ]);
      },

      // ✅ REMOÇÃO: Funções fetchAll* não são mais necessárias
      // As funções principais (fetchTopUsersData, fetchTopModelsData, etc.)
      // agora já buscam TODOS os dados e fazem slice(0,10) para os gráficos
    }),
    {
      name: 'report-store',
    },
  ),
);

// Utilitários para trabalhar com os relatórios
export const ReportUtils = {
  // Converte filtros para query string da API
  buildQueryParams: (filters: ReportFilters): URLSearchParams => {
    const params = new URLSearchParams();

    if (filters.startDate) {
      params.append('start_date', filters.startDate);
    }

    if (filters.endDate) {
      params.append('end_date', filters.endDate);
    }

    if (filters.costCenter) {
      params.append('cost_center', filters.costCenter);
    }

    return params;
  },

  // 🎨 FUNÇÕES PRINCIPAIS PARA CONTROLE DE CORES

  // 🎨 FUNÇÕES PARA ACESSAR CORES DE CADA GRÁFICO ESPECÍFICO

  // Pega uma cor específica de um gráfico por índice
  getGraphColor: (
    graphType: keyof typeof REPORT_CONFIG.CHART_COLORS_BY_TYPE,
    index: number = 0,
  ): string => {
    const colors = REPORT_CONFIG.CHART_COLORS_BY_TYPE[graphType];
    if (Array.isArray(colors)) {
      return colors[index % colors.length];
    }
    // Para compatibilidade com USAGE_COST_DETAILED
    return REPORT_CONFIG.CHART_COLORS[index % REPORT_CONFIG.CHART_COLORS.length];
  },

  /** Cor estável por chave (nome do modelo) — independe da posição no ranking */
  getStableColorForKey: (key: string, palette: readonly string[]): string => {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = (hash << 5) - hash + key.charCodeAt(i);
      hash |= 0;
    }
    return palette[Math.abs(hash) % palette.length];
  },

  addColorsToModels: (
    models: Omit<ModelData, 'fill'>[],
    paletteKey: 'MODELS_MESSAGES' | 'MODELS_COST',
  ): ModelData[] => {
    const palette = REPORT_CONFIG.CHART_COLORS_BY_TYPE[paletteKey];
    return models.map((model) => ({
      ...model,
      fill: ReportUtils.getStableColorForKey(model.modelId ?? model.name, palette),
    }));
  },

  /** @deprecated Use addColorsToModels */
  addColorsToModelsSpecific: (models: Omit<ModelData, 'fill'>[]): ModelData[] =>
    ReportUtils.addColorsToModels(models, 'MODELS_MESSAGES'),

  // 🎨 NOVAS FUNÇÕES PARA USUÁRIOS COM CORES ESPECÍFICAS

  // Adiciona cores específicas aos dados de usuários (volume) - cada usuário uma cor diferente
  addColorsToUsersVolume: (users: Omit<UserData, 'fill'>[]): UserData[] => {
    const colors = REPORT_CONFIG.CHART_COLORS_BY_TYPE.USER_MESSAGES;
    return users.map((user, index) => ({
      ...user,
      fill: colors[index % colors.length],
    }));
  },

  // Adiciona cores específicas aos dados de usuários (custo) - cada usuário uma cor diferente
  addColorsToUsersCost: (users: Omit<UserData, 'fill'>[]): UserData[] => {
    const colors = REPORT_CONFIG.CHART_COLORS_BY_TYPE.USER_COST;
    return users.map((user, index) => ({
      ...user,
      fill: colors[index % colors.length],
    }));
  },

  // Adiciona cores específicas aos dados de eficiência de usuários - cada usuário uma cor diferente
  addColorsToUsersEfficiency: (users: Omit<UserData, 'fill'>[]): UserData[] => {
    const colors = REPORT_CONFIG.CHART_COLORS_BY_TYPE.USER_EFFICIENCY;
    return users.map((user, index) => ({
      ...user,
      fill: colors[index % colors.length],
    }));
  },

  // 🎨 NOVAS FUNÇÕES PARA CENTROS DE CUSTO COM CORES ESPECÍFICAS

  // Adiciona cores específicas aos dados de centros de custo (volume) - cada CC uma cor diferente
  addColorsToCostCentersVolume: (costCenters: Omit<ModelData, 'fill'>[]): ModelData[] => {
    const colors = REPORT_CONFIG.CHART_COLORS_BY_TYPE.COST_CENTERS_VOLUME;
    return costCenters.map((cc, index) => ({
      ...cc,
      fill: colors[index % colors.length],
    }));
  },

  // Adiciona cores específicas aos dados de centros de custo (custo) - cada CC uma cor diferente
  addColorsToCostCentersCost: (costCenters: Omit<ModelData, 'fill'>[]): ModelData[] => {
    const colors = REPORT_CONFIG.CHART_COLORS_BY_TYPE.COST_CENTERS_COST;
    return costCenters.map((cc, index) => ({
      ...cc,
      fill: colors[index % colors.length],
    }));
  },

  // Funções específicas para cada gráfico (mais fácil de usar)
  getUserMessagesColors: () => REPORT_CONFIG.CHART_COLORS_BY_TYPE.USER_MESSAGES,
  getUserCostColors: () => REPORT_CONFIG.CHART_COLORS_BY_TYPE.USER_COST,
  getModelsMessagesColors: () => REPORT_CONFIG.CHART_COLORS_BY_TYPE.MODELS_MESSAGES,
  getModelsCostColors: () => REPORT_CONFIG.CHART_COLORS_BY_TYPE.MODELS_COST,
  getUserEfficiencyColors: () => REPORT_CONFIG.CHART_COLORS_BY_TYPE.USER_EFFICIENCY,
  getUsageCostColors: () => REPORT_CONFIG.CHART_COLORS_BY_TYPE.USAGE_COST,
  getKPIColors: () => REPORT_CONFIG.CHART_COLORS_BY_TYPE.KPIS,
  getCostCentersVolumeColors: () => REPORT_CONFIG.CHART_COLORS_BY_TYPE.COST_CENTERS_VOLUME,
  getCostCentersCostColors: () => REPORT_CONFIG.CHART_COLORS_BY_TYPE.COST_CENTERS_COST,

  // Função especial para gráfico de uso/custo que usa objeto específico
  getUsageCostDetailedColor: (
    dataKey: keyof typeof REPORT_CONFIG.CHART_COLORS_BY_TYPE.USAGE_COST_DETAILED,
  ) => {
    return REPORT_CONFIG.CHART_COLORS_BY_TYPE.USAGE_COST_DETAILED[dataKey];
  },
};
