/* eslint-disable react/no-unescaped-entities */
import React from 'react';
import { ThemeSelector } from '~/components/ui';
import { Link } from 'react-router-dom';
import { FaHome } from 'react-icons/fa';
import { useLocalize } from '~/hooks';

const AiTokenBurnRates = () => {
  const localize = useLocalize();
  return (
    <div className="relative min-h-screen bg-gray-100 text-gray-900 dark:bg-gray-900 dark:text-white">
      <div className="fixed bottom-0 left-0 m-4">
        <ThemeSelector />
      </div>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-4">
          <h1 className="text-2xl font-bold">{localize('com_token_usage_overview')}</h1>
          <Link to="/login" className="text-black-500 hover:text-blue-700">
            <FaHome className="h-6 w-6" />
          </Link>
        </div>
        <div className="mb-8">
          <p className="mb-4">{localize('com_token_usage_description')}</p>
          <h2 className="mb-2 text-xl font-bold">{localize('com_model_consumption_rates')}</h2>
          <p>{localize('com_model_rates_table')}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full table-auto border-collapse border border-gray-400">
            <thead>
              <tr>
                <th className="border border-gray-400 px-4 py-2">{localize('com_model')}</th>
                <th className="border border-gray-400 px-4 py-2">{localize('com_input_tokens')}</th>
                <th className="border border-gray-400 px-4 py-2">
                  {localize('com_output_tokens')}
                </th>
                <th className="border border-gray-400 px-4 py-2">{localize('com_burn_rate')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-400 px-4 py-2">
                  {localize('com_gpt_3_5_turbo')}
                </td>
                <td className="border border-gray-400 px-4 py-2">0.3</td>
                <td className="border border-gray-400 px-4 py-2">0.5</td>
                <td className="border border-gray-400 px-4 py-2">0.4</td>
              </tr>
              <tr>
                <td className="border border-gray-400 px-4 py-2">{localize('com_gpt_4')}</td>
                <td className="border border-gray-400 px-4 py-2">3</td>
                <td className="border border-gray-400 px-4 py-2">8</td>
                <td className="border border-gray-400 px-4 py-2">5</td>
              </tr>
              <tr>
                <td className="border border-gray-400 px-4 py-2">
                  {localize('com_claude_3_haiku')}
                </td>
                <td className="border border-gray-400 px-4 py-2">0.15</td>
                <td className="border border-gray-400 px-4 py-2">0.75</td>
                <td className="border border-gray-400 px-4 py-2">0.3</td>
              </tr>
              <tr>
                <td className="border border-gray-400 px-4 py-2">
                  {localize('com_claude_3_sonnet')}
                </td>
                <td className="border border-gray-400 px-4 py-2">0.6</td>
                <td className="border border-gray-400 px-4 py-2">3.75</td>
                <td className="border border-gray-400 px-4 py-2">1.5</td>
              </tr>
              <tr>
                <td className="border border-gray-400 px-4 py-2">
                  {localize('com_claude_3_opus')}
                </td>
                <td className="border border-gray-400 px-4 py-2">8</td>
                <td className="border border-gray-400 px-4 py-2">20</td>
                <td className="border border-gray-400 px-4 py-2">12</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-8">
          <p>{localize('com_token_consumption_depends')}</p>
        </div>
        <div className="mt-8">
          <h2 className="mb-2 text-xl font-bold">
            {localize('com_how_to_calculate_token_consumption')}
          </h2>
          <p className="mb-4">{localize('com_total_token_consumption_formula')}</p>
          <pre className="mb-4 overflow-x-auto rounded bg-gray-800 p-4">
            <code className="text-white">
              Total Token Consumption = (Input Tokens + Output Tokens) * Burn Rate
            </code>
          </pre>
          <h2 className="mb-2 text-xl font-bold">{localize('com_example_of_token_consumption')}</h2>
          <p className="mb-4">{localize('com_example_of_token_consumption')}</p>
          <pre className="overflow-x-auto rounded bg-gray-800 p-4">
            <code className="text-white">
              Input Tokens = 50 (context) + 100 (prompt) = 150 tokens
              <br />
              Output Tokens = 50 tokens
              <br />
              Total Tokens (Input + Output) = 150 + 50 = 200 tokens
              <br />
              Total Token Consumption = 200 tokens * Burn Rate 5 = 1000 tokens
            </code>
          </pre>
        </div>
        <div className="mt-8">
          <h2 className="mb-2 text-xl font-bold">{localize('com_important_considerations')}</h2>
          <p>{localize('com_important_considerations_text')}</p>
        </div>
        <hr className="my-12 h-0.5 border-t-0 bg-black dark:bg-white/10" />
        <div className="mt-8">
          <h1 className="mb-4 mt-8 text-2xl font-bold ">{localize('com_comparative_analysis')}</h1>
          <p>{localize('com_comparative_analysis_text')}</p>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="overflow-x-auto">
          <table className="w-full table-auto border-collapse border border-gray-400">
            <thead>
              <tr>
                <th className="border border-gray-400 px-4 py-2"></th>
                <th className="border border-gray-400 px-4 py-2">
                  {localize('com_claude_3_opus')}
                </th>
                <th className="border border-gray-400 px-4 py-2">
                  {localize('com_claude_3_sonnet')}
                </th>
                <th className="border border-gray-400 px-4 py-2">
                  {localize('com_claude_3_haiku')}
                </th>
                <th className="border border-gray-400 px-4 py-2">{localize('com_gpt_4')}</th>
                <th className="border border-gray-400 px-4 py-2">
                  {localize('com_gpt_3_5_turbo')}
                </th>
                <th className="border border-gray-400 px-4 py-2">
                  Gemini 1.0
                  <br />
                  Ultra
                </th>
                <th className="border border-gray-400 px-4 py-2">
                  Gemini 1.0
                  <br />
                  Pro
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-400 px-4 py-2">
                  {localize('com_undergraduate_biology')}
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  86.8%
                  <br />
                  5-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  79.0%
                  <br />
                  5-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  75.2%
                  <br />
                  5-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  86.4%
                  <br />
                  5-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  70.0%
                  <br />
                  5-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  83.7%
                  <br />
                  5-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  71.8%
                  <br />
                  5-shot
                </td>
              </tr>
              <tr>
                <td className="border border-gray-400 px-4 py-2">
                  {localize('com_graduate_reasoning')}
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  50.4%
                  <br />
                  0-shot CoT
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  40.4%
                  <br />
                  0-shot CoT
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  33.3%
                  <br />
                  0-shot CoT
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  35.7%
                  <br />
                  0-shot CoT
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  28.1%
                  <br />
                  0-shot CoT
                </td>
                <td className="border border-gray-400 px-4 py-2">—</td>
                <td className="border border-gray-400 px-4 py-2">—</td>
              </tr>
              <tr>
                <td className="border border-gray-400 px-4 py-2">
                  {localize('com_grade_school_math')}
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  95.0%
                  <br />
                  0-shot CoT
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  92.3%
                  <br />
                  0-shot CoT
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  88.9%
                  <br />
                  0-shot CoT
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  92.0%
                  <br />
                  5-shot CoT
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  57.1%
                  <br />
                  5-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  94.4%
                  <br />
                  Maijis32
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  86.5%
                  <br />
                  Maijis32
                </td>
              </tr>
              <tr>
                <td className="border border-gray-400 px-4 py-2">
                  {localize('com_math_problem_solving')}
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  60.1%
                  <br />
                  0-shot CoT
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  43.1%
                  <br />
                  0-shot CoT
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  38.9%
                  <br />
                  0-shot CoT
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  52.9%
                  <br />
                  4-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  34.1%
                  <br />
                  4-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  53.2%
                  <br />
                  4-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  32.6%
                  <br />
                  4-shot
                </td>
              </tr>
              <tr>
                <td className="border border-gray-400 px-4 py-2">
                  {localize('com_multilingual_math')}
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  90.7%
                  <br />
                  0-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  83.5%
                  <br />
                  0-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  75.1%
                  <br />
                  0-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  74.5%
                  <br />
                  5-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">—</td>
                <td className="border border-gray-400 px-4 py-2">
                  79.0%
                  <br />
                  5-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  63.5%
                  <br />
                  5-shot
                </td>
              </tr>
              <tr>
                <td className="border border-gray-400 px-4 py-2">{localize('com_code')}</td>
                <td className="border border-gray-400 px-4 py-2">
                  84.9%
                  <br />
                  0-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  73.0%
                  <br />
                  0-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  75.9%
                  <br />
                  0-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  67.0%
                  <br />
                  0-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  48.1%
                  <br />
                  0-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  74.4%
                  <br />
                  0-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  67.7%
                  <br />
                  0-shot
                </td>
              </tr>
              <tr>
                <td className="border border-gray-400 px-4 py-2">
                  {localize('com_reasoning_over_text')}
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  83.1
                  <br />
                  3-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  78.9
                  <br />
                  3-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  78.4
                  <br />
                  3-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  80.9
                  <br />
                  3-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  64.1
                  <br />
                  5-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  82.4
                  <br />
                  Variable shots
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  74.1
                  <br />
                  Variable shots
                </td>
              </tr>
              <tr>
                <td className="border border-gray-400 px-4 py-2">
                  {localize('com_mixed_evaluations')}
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  86.8%
                  <br />
                  3-shot CoT
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  82.9%
                  <br />
                  3-shot CoT
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  73.7%
                  <br />
                  3-shot CoT
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  83.1%
                  <br />
                  3-shot CoT
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  66.6%
                  <br />
                  3-shot CoT
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  83.6%
                  <br />
                  3-shot CoT
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  75.0%
                  <br />
                  3-shot CoT
                </td>
              </tr>
              <tr>
                <td className="border border-gray-400 px-4 py-2">{localize('com_knowledge_qa')}</td>
                <td className="border border-gray-400 px-4 py-2">
                  96.4%
                  <br />
                  25-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  93.2%
                  <br />
                  25-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  89.2%
                  <br />
                  25-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  96.3%
                  <br />
                  25-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  85.2%
                  <br />
                  25-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">—</td>
                <td className="border border-gray-400 px-4 py-2">—</td>
              </tr>
              <tr>
                <td className="border border-gray-400 px-4 py-2">
                  {localize('com_common_knowledge')}
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  95.4%
                  <br />
                  10-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  89.0%
                  <br />
                  10-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  85.9%
                  <br />
                  10-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  95.3%
                  <br />
                  10-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  85.5%
                  <br />
                  10-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  87.8%
                  <br />
                  10-shot
                </td>
                <td className="border border-gray-400 px-4 py-2">
                  84.7%
                  <br />
                  10-shot
                </td>
              </tr>
            </tbody>
          </table>
          <h2 className="mb-4 mt-8 text-2xl font-bold">AI Models and their Use Cases</h2>

          <h3 className="mb-2 text-xl font-bold">{localize('com_gpt_3_5_turbo')}</h3>
          <p className="mb-4">{localize('com_gpt_3_5_use_case')}</p>

          <h3 className="mb-2 text-xl font-bold">{localize('com_gpt_4')}</h3>
          <p className="mb-4">{localize('com_gpt_4_use_case')}</p>

          <h3 className="mb-2 text-xl font-bold">{localize('com_claude_3_haiku')}</h3>
          <p className="mb-4">{localize('com_claude_3_haiku_use_case')}</p>

          <h3 className="mb-2 text-xl font-bold">{localize('com_claude_3_sonnet')}</h3>
          <p className="mb-4">{localize('com_claude_3_sonnet_use_case')}</p>

          <h3 className="mb-2 text-xl font-bold">{localize('com_claude_3_opus')}</h3>
          <p>{localize('com_claude_3_opus_use_case')}</p>
        </div>
      </div>
    </div>
  );
};

export default AiTokenBurnRates;
