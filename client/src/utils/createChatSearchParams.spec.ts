import { EModelEndpoint, Constants } from 'librechat-data-provider';
import type { TConversation, TPreset } from 'librechat-data-provider';
import createChatSearchParams from './createChatSearchParams';

describe('createChatSearchParams', () => {
  describe('conversation inputs', () => {
    it('handles basic conversation properties', () => {
      const conversation: Partial<TConversation> = {
        endpoint: EModelEndpoint.openAI,
        model: 'gpt-4',
        temperature: 0.7,
      };

      const result = createChatSearchParams(conversation as TConversation);
      expect(result.get('endpoint')).toBe(EModelEndpoint.openAI);
      expect(result.get('model')).toBe('gpt-4');
      expect(result.get('temperature')).toBe('0.7');
    });

    it('applies only the endpoint property when other conversation fields are absent', () => {
      const endpointOnly = createChatSearchParams({
        endpoint: EModelEndpoint.openAI,
      } as TConversation);
      expect(endpointOnly.get('endpoint')).toBe(EModelEndpoint.openAI);
      expect(endpointOnly.has('model')).toBe(false);
      expect(endpointOnly.has('endpoint')).toBe(true);
    });

    it('applies only the model property when other conversation fields are absent', () => {
      const modelOnly = createChatSearchParams({ model: 'gpt-4' } as TConversation);
      expect(modelOnly.has('endpoint')).toBe(false);
      expect(modelOnly.get('model')).toBe('gpt-4');
      expect(modelOnly.has('model')).toBe(true);
    });

    it('includes assistant_id when endpoint is assistants', () => {
      const withAssistantId = createChatSearchParams({
        endpoint: EModelEndpoint.assistants,
        model: 'gpt-4',
        assistant_id: 'asst_123',
        temperature: 0.7,
      } as TConversation);

      expect(withAssistantId.get('assistant_id')).toBe('asst_123');
      expect(withAssistantId.has('endpoint')).toBe(false);
      expect(withAssistantId.has('model')).toBe(false);
      expect(withAssistantId.has('temperature')).toBe(false);
    });

    it('includes agent_id when endpoint is agents', () => {
      const withAgentId = createChatSearchParams({
        endpoint: EModelEndpoint.agents,
        model: 'gpt-4',
        agent_id: 'agent_123',
        temperature: 0.7,
      } as TConversation);

      expect(withAgentId.get('agent_id')).toBe('agent_123');
      expect(withAgentId.has('endpoint')).toBe(false);
      expect(withAgentId.has('model')).toBe(false);
      expect(withAgentId.has('temperature')).toBe(false);
    });

    it('excludes all parameters except assistant_id when endpoint is assistants', () => {
      const withAssistantId = createChatSearchParams({
        endpoint: EModelEndpoint.assistants,
        model: 'gpt-4',
        assistant_id: 'asst_123',
        temperature: 0.7,
      } as TConversation);

      expect(withAssistantId.get('assistant_id')).toBe('asst_123');
      expect(withAssistantId.has('endpoint')).toBe(false);
      expect(withAssistantId.has('model')).toBe(false);
      expect(withAssistantId.has('temperature')).toBe(false);
      expect([...withAssistantId.entries()].length).toBe(1);
    });

    it('excludes all parameters except agent_id when endpoint is agents', () => {
      const withAgentId = createChatSearchParams({
        endpoint: EModelEndpoint.agents,
        model: 'gpt-4',
        agent_id: 'agent_123',
        temperature: 0.7,
      } as TConversation);

      expect(withAgentId.get('agent_id')).toBe('agent_123');
      expect(withAgentId.has('endpoint')).toBe(false);
      expect(withAgentId.has('model')).toBe(false);
      expect(withAgentId.has('temperature')).toBe(false);
      expect([...withAgentId.entries()].length).toBe(1);
    });

    it('returns empty params when agent endpoint has no agent_id', () => {
      const result = createChatSearchParams({
        endpoint: EModelEndpoint.agents,
        model: 'gpt-4',
        temperature: 0.7,
      } as TConversation);

      expect(result.toString()).toBe('');
      expect([...result.entries()].length).toBe(0);
    });

    it('returns empty params when assistants endpoint has no assistant_id', () => {
      const result = createChatSearchParams({
        endpoint: EModelEndpoint.assistants,
        model: 'gpt-4',
        temperature: 0.7,
      } as TConversation);

      expect(result.toString()).toBe('');
      expect([...result.entries()].length).toBe(0);
    });

    it('ignores agent_id when it matches EPHEMERAL_AGENT_ID', () => {
      const result = createChatSearchParams({
        endpoint: EModelEndpoint.agents,
        model: 'gpt-4',
        agent_id: Constants.EPHEMERAL_AGENT_ID,
        temperature: 0.7,
      } as TConversation);

      // The agent_id is ignored but other params are still included
      expect(result.has('agent_id')).toBe(false);
      expect(result.get('endpoint')).toBe(EModelEndpoint.agents);
      expect(result.get('model')).toBe('gpt-4');
      expect(result.get('temperature')).toBe('0.7');
    });

    it('handles stop arrays correctly by joining with commas', () => {
      const withStopArray = createChatSearchParams({
        endpoint: EModelEndpoint.openAI,
        model: 'gpt-4',
        stop: ['stop1', 'stop2'],
      } as TConversation);

      expect(withStopArray.get('endpoint')).toBe(EModelEndpoint.openAI);
      expect(withStopArray.get('model')).toBe('gpt-4');
      expect(withStopArray.get('stop')).toBe('stop1,stop2');
    });

    it('filters out non-supported array properties', () => {
      const withOtherArray = createChatSearchParams({
        endpoint: EModelEndpoint.openAI,
        model: 'gpt-4',
        otherArrayProp: ['value1', 'value2'],
      } as any);

      expect(withOtherArray.get('endpoint')).toBe(EModelEndpoint.openAI);
      expect(withOtherArray.get('model')).toBe('gpt-4');
      expect(withOtherArray.has('otherArrayProp')).toBe(false);
    });

    it('includes empty arrays in output params', () => {
      const result = createChatSearchParams({
        endpoint: EModelEndpoint.openAI,
        stop: [],
      });

      expect(result.get('endpoint')).toBe(EModelEndpoint.openAI);
      expect(result.has('stop')).toBe(true);
      expect(result.get('stop')).toBe('');
    });

    it('handles non-stop arrays correctly in paramMap', () => {
      const conversation: any = {
        endpoint: EModelEndpoint.openAI,
        model: 'gpt-4',
        top_p: ['0.7', '0.8'],
      };

      const result = createChatSearchParams(conversation);

      const expectedJson = JSON.stringify(['0.7', '0.8']);
      expect(result.get('top_p')).toBe(expectedJson);
      expect(result.get('endpoint')).toBe(EModelEndpoint.openAI);
      expect(result.get('model')).toBe('gpt-4');
    });

    it('includes empty non-stop arrays as serialized empty arrays', () => {
      const result = createChatSearchParams({
        endpoint: EModelEndpoint.openAI,
        model: 'gpt-4',
        temperature: 0.7,
        top_p: [],
      } as any);

      expect(result.get('endpoint')).toBe(EModelEndpoint.openAI);
      expect(result.get('model')).toBe('gpt-4');
      expect(result.get('temperature')).toBe('0.7');
      expect(result.has('top_p')).toBe(true);
      expect(result.get('top_p')).toBe('[]');
    });

    it('excludes parameters with null or undefined values from the output', () => {
      const result = createChatSearchParams({
        endpoint: EModelEndpoint.openAI,
        model: 'gpt-4',
        temperature: 0.7,
        top_p: undefined,
        presence_penalty: undefined,
        frequency_penalty: null,
      } as any);

      expect(result.get('endpoint')).toBe(EModelEndpoint.openAI);
      expect(result.get('model')).toBe('gpt-4');
      expect(result.get('temperature')).toBe('0.7');
      expect(result.has('top_p')).toBe(false);
      expect(result.has('presence_penalty')).toBe(false);
      expect(result.has('frequency_penalty')).toBe(false);
      expect(result).toBeDefined();
    });

    it('handles float parameter values correctly', () => {
      const result = createChatSearchParams({
        endpoint: EModelEndpoint.google,
        model: 'gemini-pro',
        frequency_penalty: 0.25,
        temperature: 0.75,
      });

      expect(result.get('endpoint')).toBe(EModelEndpoint.google);
      expect(result.get('model')).toBe('gemini-pro');
      expect(result.get('frequency_penalty')).toBe('0.25');
      expect(result.get('temperature')).toBe('0.75');
    });

    it('handles integer parameter values correctly', () => {
      const result = createChatSearchParams({
        endpoint: EModelEndpoint.google,
        model: 'gemini-pro',
        topK: 40,
        maxOutputTokens: 2048,
      });

      expect(result.get('endpoint')).toBe(EModelEndpoint.google);
      expect(result.get('model')).toBe('gemini-pro');
      expect(result.get('topK')).toBe('40');
      expect(result.get('maxOutputTokens')).toBe('2048');
    });
  });

  describe('preset inputs', () => {
    it('handles preset objects correctly', () => {
      const preset: Partial<TPreset> = {
        endpoint: EModelEndpoint.google,
        model: 'gemini-pro',
        temperature: 0.5,
        topP: 0.8,
      };

      const result = createChatSearchParams(preset as TPreset);
      expect(result.get('endpoint')).toBe(EModelEndpoint.google);
      expect(result.get('model')).toBe('gemini-pro');
      expect(result.get('temperature')).toBe('0.5');
      expect(result.get('topP')).toBe('0.8');
    });

    it('returns only spec param when spec property is present', () => {
      const preset: Partial<TPreset> = {
        endpoint: EModelEndpoint.google,
        model: 'gemini-pro',
        temperature: 0.5,
        spec: 'special_spec',
      };

      const result = createChatSearchParams(preset as TPreset);
      expect(result.get('spec')).toBe('special_spec');
      expect(result.has('endpoint')).toBe(false);
      expect(result.has('model')).toBe(false);
      expect(result.has('temperature')).toBe(false);
      expect([...result.entries()].length).toBe(1);
    });
  });

  describe('record inputs', () => {
    it('includes allowed parameters from Record inputs', () => {
      const record: Record<string, any> = {
        endpoint: EModelEndpoint.anthropic,
        model: 'claude-2',
        temperature: '0.8',
        top_p: '0.95',
        extraParam: 'should-not-be-included',
        invalidParam1: 'value1',
        invalidParam2: 'value2',
      };

      const result = createChatSearchParams(record);
      expect(result.get('endpoint')).toBe(EModelEndpoint.anthropic);
      expect(result.get('model')).toBe('claude-2');
      expect(result.get('temperature')).toBe('0.8');
      expect(result.get('top_p')).toBe('0.95');
    });

    it('excludes disallowed parameters from Record inputs', () => {
      const record: Record<string, any> = {
        endpoint: EModelEndpoint.anthropic,
        model: 'claude-2',
        extraParam: 'should-not-be-included',
        invalidParam1: 'value1',
        invalidParam2: 'value2',
      };

      const result = createChatSearchParams(record);
      expect(result.has('extraParam')).toBe(false);
      expect(result.has('invalidParam1')).toBe(false);
      expect(result.has('invalidParam2')).toBe(false);
      expect(result.toString().includes('invalidParam')).toBe(false);
      expect(result.toString().includes('extraParam')).toBe(false);
    });

    it('includes valid values from Record inputs', () => {
      const record: Record<string, any> = {
        temperature: '0.7',
        top_p: null,
        frequency_penalty: undefined,
      };

      const result = createChatSearchParams(record);
      expect(result.get('temperature')).toBe('0.7');
    });

    it('excludes null or undefined values from Record inputs', () => {
      const record: Record<string, any> = {
        temperature: '0.7',
        top_p: null,
        frequency_penalty: undefined,
      };

      const result = createChatSearchParams(record);
      expect(result.has('top_p')).toBe(false);
      expect(result.has('frequency_penalty')).toBe(false);
    });

    it('handles generic object without endpoint or model properties', () => {
      const customObject = {
        temperature: '0.5',
        top_p: '0.7',
        customProperty: 'value',
      };

      const result = createChatSearchParams(customObject);
      expect(result.get('temperature')).toBe('0.5');
      expect(result.get('top_p')).toBe('0.7');
      expect(result.has('customProperty')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('returns an empty URLSearchParams instance when input is null', () => {
      const result = createChatSearchParams(null);
      expect(result.toString()).toBe('');
      expect(result instanceof URLSearchParams).toBe(true);
    });

    it('returns an empty URLSearchParams instance for an empty object input', () => {
      const result = createChatSearchParams({});
      expect(result.toString()).toBe('');
      expect(result instanceof URLSearchParams).toBe(true);
    });
  });
});
