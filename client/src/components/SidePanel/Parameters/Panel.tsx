import React, { useMemo, useState, useEffect, useCallback } from 'react';
import keyBy from 'lodash/keyBy';
import { RotateCcw } from 'lucide-react';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@librechat/client';
import {
  excludedKeys,
  paramSettings,
  getSettingsKeys,
  getEndpointField,
  EModelEndpoint,
  SettingDefinition,
  tConvoUpdateSchema,
} from 'librechat-data-provider';
import type { TPreset } from 'librechat-data-provider';
import { SaveAsPresetDialog } from '~/components/Endpoints';
import { useSetIndexOptions, useLocalize } from '~/hooks';
import { useGetEndpointsQuery } from '~/data-provider';
import { componentMapping } from './components';
import { useChatContext } from '~/Providers';
import { logger } from '~/utils';

// V1 UX POP/BETC : refonte light du panel Paramètres modèle :
// - params essentiels visibles (Instructions perso, Nom perso, Créativité, Recherche web)
// - Reste des params LLM techniques en accordéon "Réglages avancés" replié
// - Tooltips pédagogiques FR hardcodés (atelier specs post-congé pour
//   i18n EN propre + composant Créativité 3-presets).
// Pattern aligné sur builder Agent ModelPanel.tsx.
const ESSENTIAL_PARAM_KEYS = ['promptPrefix', 'modelLabel', 'chatGptLabel', 'temperature', 'web_search'];

interface ParamOverride {
  label?: string;
  description?: string;
}

const PARAM_OVERRIDES: Record<string, ParamOverride> = {
  promptPrefix: {
    label: 'Instructions personnalisées',
    description:
      "Décris comment Vermeer doit te répondre par défaut (ton, format, expertise…). Ces instructions s'appliquent à toutes tes conversations.",
  },
  maxContextTokens: {
    description:
      "Quantité maximale de texte que l'IA peut prendre en compte dans une conversation (historique + ta question). Plus c'est élevé, plus l'IA se souvient, mais plus c'est coûteux. Laisse 'Système' pour la valeur recommandée.",
  },
  max_tokens: {
    description:
      "Longueur maximale d'une réponse de l'IA. Utile pour limiter les réponses très longues. Laisse 'Système' pour la valeur recommandée.",
  },
  temperature: {
    label: 'Créativité',
    description:
      "Influence le ton et l'originalité des réponses. Valeurs basses = précis et déterministe. Valeurs hautes = plus créatif et varié. Laisse vide pour la valeur recommandée.",
  },
  top_p: {
    description:
      "Filtre les mots improbables avant de choisir la réponse. 1.00 = aucun filtre. Plus bas = réponses plus prudentes. À utiliser en alternative à la Température.",
  },
  frequency_penalty: {
    description:
      "Décourage l'IA de répéter les mêmes mots. 0 = aucune pénalité. Plus haut = vocabulaire plus varié, mais peut sembler forcé.",
  },
  presence_penalty: {
    description:
      "Encourage l'IA à introduire de nouveaux sujets. 0 = aucune pénalité. Plus haut = l'IA évite de revenir sur ce qu'elle a déjà dit.",
  },
  stop: {
    description:
      "Mots ou phrases qui font stopper l'IA dès qu'elle les écrit. Utile pour des cas techniques (génération de code, formats stricts).",
  },
  resendFiles: {
    description:
      "Re-télécharge les fichiers attachés à chaque message. Désactiver pour économiser des tokens si l'IA n'a pas besoin de re-voir les fichiers à chaque échange.",
  },
  imageDetail: {
    description:
      "Niveau de détail avec lequel l'IA analyse les images attachées. 'Automatique' s'adapte au contenu. 'Élevé' coûte plus mais voit les détails fins.",
  },
  reasoning_effort: {
    description:
      "Pour les modèles à raisonnement (o1, o3, etc.). Plus l'effort est élevé, plus l'IA prend de temps à réfléchir, et plus la réponse est solide sur des tâches complexes.",
  },
  useResponsesApi: {
    description:
      "Active la nouvelle API Responses d'OpenAI. À laisser désactivé sauf indication de l'équipe technique.",
  },
  reasoning_summary: {
    description:
      "Affiche un résumé de la chaîne de pensée du modèle quand il raisonne. 'Non défini' = comportement par défaut du modèle.",
  },
  verbosity: {
    description:
      "Niveau de détail dans les réponses. 'Aucun' = comportement par défaut. À augmenter si tu veux des explications systématiquement plus longues.",
  },
  disableStreaming: {
    description:
      "Par défaut, l'IA écrit sa réponse mot par mot en temps réel. Activer pour recevoir la réponse en une seule fois, à la fin.",
  },
  fileTokenLimit: {
    description:
      "Taille maximale (en tokens) d'un fichier que l'IA peut traiter. Laisse 'Système' pour la valeur recommandée.",
  },
};

export default function Parameters() {
  const localize = useLocalize();
  const { conversation, setConversation } = useChatContext();
  const { setOption } = useSetIndexOptions();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [preset, setPreset] = useState<TPreset | null>(null);

  const { data: endpointsConfig = {} } = useGetEndpointsQuery();
  const provider = conversation?.endpoint ?? '';
  const model = conversation?.model ?? '';

  const bedrockRegions = useMemo(() => {
    return endpointsConfig?.[conversation?.endpoint ?? '']?.availableRegions ?? [];
  }, [endpointsConfig, conversation?.endpoint]);

  const endpointType = useMemo(
    () => getEndpointField(endpointsConfig, conversation?.endpoint, 'type'),
    [conversation?.endpoint, endpointsConfig],
  );

  const parameters = useMemo((): SettingDefinition[] => {
    const customParams = endpointsConfig[provider]?.customParams ?? {};
    const [combinedKey, endpointKey] = getSettingsKeys(endpointType ?? provider, model);
    const overriddenEndpointKey = customParams.defaultParamsEndpoint ?? endpointKey;
    const defaultParams = paramSettings[combinedKey] ?? paramSettings[overriddenEndpointKey] ?? [];
    const overriddenParams = endpointsConfig[provider]?.customParams?.paramDefinitions ?? [];
    const overriddenParamsMap = keyBy(overriddenParams, 'key');
    return defaultParams
      .filter((param) => param != null)
      // web_search natif non supporté par les endpoints custom (ex. French
      // Models/Featherless) → 400. On masque le toggle hors endpoints natifs.
      // La useEffect de nettoyage ci-dessous retire alors le param de la
      // conversation si l'user bascule vers un endpoint custom.
      .filter((param) => param.key !== 'web_search' || endpointType !== EModelEndpoint.custom)
      .map((param) => (overriddenParamsMap[param.key] as SettingDefinition) ?? param)
      .map((param) => {
        const override = PARAM_OVERRIDES[param.key];
        if (!override) {
          return param;
        }
        return {
          ...param,
          ...(override.label != null && { label: override.label, labelCode: false }),
          ...(override.description != null && {
            description: override.description,
            descriptionCode: false,
          }),
        } as SettingDefinition;
      });
  }, [endpointType, endpointsConfig, model, provider]);

  const { essentialParams, advancedParams } = useMemo(() => {
    const essentialByKey = new Map<string, SettingDefinition>();
    const advanced: SettingDefinition[] = [];
    for (const param of parameters) {
      if (ESSENTIAL_PARAM_KEYS.includes(param.key)) {
        essentialByKey.set(param.key, param);
      } else {
        advanced.push(param);
      }
    }
    const ordered = ESSENTIAL_PARAM_KEYS.map((k) => essentialByKey.get(k)).filter(
      (p): p is SettingDefinition => p != null,
    );
    return { essentialParams: ordered, advancedParams: advanced };
  }, [parameters]);

  useEffect(() => {
    if (!parameters) {
      return;
    }

    // const defaultValueMap = new Map();
    // const paramKeys = new Set(
    //   parameters.map((setting) => {
    //     if (setting.default != null) {
    //       defaultValueMap.set(setting.key, setting.default);
    //     }
    //     return setting.key;
    //   }),
    // );
    const paramKeys = new Set(
      parameters.filter((setting) => setting != null).map((setting) => setting.key),
    );
    setConversation((prev) => {
      if (!prev) {
        return prev;
      }

      const updatedConversation = { ...prev };

      const conversationKeys = Object.keys(updatedConversation);
      const updatedKeys: string[] = [];
      conversationKeys.forEach((key) => {
        // const defaultValue = defaultValueMap.get(key);
        // if (paramKeys.has(key) && defaultValue != null && prev[key] != null) {
        //   updatedKeys.push(key);
        //   updatedConversation[key] = defaultValue;
        //   return;
        // }

        if (paramKeys.has(key)) {
          return;
        }

        if (excludedKeys.has(key)) {
          return;
        }

        if (prev[key] != null) {
          updatedKeys.push(key);
          delete updatedConversation[key];
        }
      });

      logger.log('parameters', 'parameters effect, updated keys:', updatedKeys);

      return updatedConversation;
    });
  }, [parameters, setConversation]);

  const resetParameters = useCallback(() => {
    setConversation((prev) => {
      if (!prev) {
        return prev;
      }

      const updatedConversation = { ...prev };
      const resetKeys: string[] = [];

      Object.keys(updatedConversation).forEach((key) => {
        if (excludedKeys.has(key)) {
          return;
        }

        if (updatedConversation[key] !== undefined) {
          resetKeys.push(key);
          delete updatedConversation[key];
        }
      });

      logger.log('parameters', 'parameters reset, affected keys:', resetKeys);
      return updatedConversation;
    });
  }, [setConversation]);

  const openDialog = useCallback(() => {
    const newPreset = tConvoUpdateSchema.parse({
      ...conversation,
    }) as TPreset;
    setPreset(newPreset);
    setIsDialogOpen(true);
  }, [conversation]);

  if (!parameters) {
    return null;
  }

  const renderParam = (setting: SettingDefinition) => {
    const Component = componentMapping[setting.component];
    if (!Component) {
      return null;
    }
    const { key, default: defaultValue, ...rest } = setting;
    if (key === 'region' && bedrockRegions.length) {
      rest.options = bedrockRegions;
    }
    return (
      <Component
        key={key}
        settingKey={key}
        defaultValue={defaultValue}
        {...rest}
        setOption={setOption}
        conversation={conversation}
      />
    );
  };

  return (
    <div className="h-auto max-w-full px-3 pb-3 pt-2">
      {/* Section visible : paramètres essentiels (Instructions, Nom, Température) */}
      {essentialParams.length > 0 && (
        <div className="grid grid-cols-2 gap-4">{essentialParams.map(renderParam)}</div>
      )}

      {/* Accordéon "Réglages avancés" replié par défaut : tous les autres params LLM */}
      {advancedParams.length > 0 && (
        <Accordion type="single" collapsible className="mt-4 w-full">
          <AccordionItem value="advanced-settings" className="border-b-0">
            <AccordionTrigger className="text-sm font-medium text-text-primary hover:no-underline">
              {localize('com_ui_advanced_settings')}
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-2 gap-4 pt-2">{advancedParams.map(renderParam)}</div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      <div className="mt-4 flex justify-center">
        <button
          type="button"
          onClick={resetParameters}
          className="btn btn-neutral flex w-full items-center justify-center gap-2 px-4 py-2 text-sm"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {localize('com_ui_reset')}
        </button>
      </div>
      <div className="mt-2 flex justify-center">
        <button
          onClick={openDialog}
          className="btn btn-primary focus:shadow-outline flex w-full items-center justify-center px-4 py-2 font-semibold text-white hover:bg-green-600 focus:border-green-500"
          type="button"
        >
          {localize('com_endpoint_save_as_preset')}
        </button>
      </div>
      {preset && (
        <SaveAsPresetDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} preset={preset} />
      )}
    </div>
  );
}
