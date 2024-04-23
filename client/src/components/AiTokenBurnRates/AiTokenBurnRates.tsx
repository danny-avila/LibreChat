/* eslint-disable */
import React from 'react';
import { ThemeSelector } from '~/components/ui';
import { Link } from 'react-router-dom';
import { FaHome } from 'react-icons/fa';

const AiTokenBurnRates = () => {
  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 dark:bg-gray-900 dark:text-white">
      <div className="absolute bottom-0 left-0 m-4">
        <ThemeSelector />
      </div>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-4">
          <h1 className="text-2xl font-bold">Token Usage Overview</h1>
          <Link to="/login" className="text-black-500 hover:text-blue-700">
            <FaHome className="h-6 w-6" />
          </Link>
        </div>
        <div className="mb-8">
          <p className="mb-4">
            When purchasing tokens, these can be used with various language models available on our
            platform. Each model has an associated "burn rate" (BR), which serves as a way to
            compare token consumption rates across different models. This rate provides you with a
            multiplier that reflects the average token consumption for both input and output
            combined.
          </p>
          <h2 className="mb-2 text-xl font-bold">Model Consumption Rates</h2>
          <p>Below is a table outlining the burn rates for different models:</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full table-auto border-collapse border border-gray-400">
            <thead>
              <tr>
                <th className="border border-gray-400 px-4 py-2">Model</th>
                <th className="border border-gray-400 px-4 py-2">Input Tokens</th>
                <th className="border border-gray-400 px-4 py-2">Output Tokens</th>
                <th className="border border-gray-400 px-4 py-2">Burn Rate (BR)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-400 px-4 py-2">GPT-3.5 Turbo</td>
                <td className="border border-gray-400 px-4 py-2">0.3</td>
                <td className="border border-gray-400 px-4 py-2">0.5</td>
                <td className="border border-gray-400 px-4 py-2">0.4</td>
              </tr>
              <tr>
                <td className="border border-gray-400 px-4 py-2">GPT-4</td>
                <td className="border border-gray-400 px-4 py-2">3</td>
                <td className="border border-gray-400 px-4 py-2">8</td>
                <td className="border border-gray-400 px-4 py-2">5</td>
              </tr>
              <tr>
                <td className="border border-gray-400 px-4 py-2">Claude-3 Haiku</td>
                <td className="border border-gray-400 px-4 py-2">0.15</td>
                <td className="border border-gray-400 px-4 py-2">0.75</td>
                <td className="border border-gray-400 px-4 py-2">0.3</td>
              </tr>
              <tr>
                <td className="border border-gray-400 px-4 py-2">Claude-3 Sonnet</td>
                <td className="border border-gray-400 px-4 py-2">0.6</td>
                <td className="border border-gray-400 px-4 py-2">3.75</td>
                <td className="border border-gray-400 px-4 py-2">1.5</td>
              </tr>
              <tr>
                <td className="border border-gray-400 px-4 py-2">Claude-3 Opus</td>
                <td className="border border-gray-400 px-4 py-2">8</td>
                <td className="border border-gray-400 px-4 py-2">20</td>
                <td className="border border-gray-400 px-4 py-2">12</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-8">
          <p>
            Token consumption upon interacting with a model depends on the combined number of input
            and output tokens. Input consists of context and prompt tokens, with context tokens
            providing background and prompt tokens directing the model's task.
          </p>
        </div>
        <div className="mt-8">
          <h2 className="mb-2 text-xl font-bold">How to Calculate Token Consumption</h2>
          <p className="mb-4">
            For estimating total token consumption, utilize the following formula:
          </p>
          <pre className="mb-4 overflow-x-auto rounded bg-gray-800 p-4">
            <code className="text-white">
              Total Token Consumption = (Input Tokens + Output Tokens) * Burn Rate
            </code>
          </pre>
          <h2 className="mb-2 text-xl font-bold">Example of Token Consumption</h2>
          <p className="mb-4">
            Here's a hypothetical scenario using a model with a burn rate of 5. If an interaction
            includes 50 context, 100 prompt tokens, and the model produces a 50-token response, the
            consumption is calculated as:
          </p>
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
          <h2 className="mb-2 text-xl font-bold">Important Considerations</h2>
          <p>
            The provided burn rate is a tool to compare the token usage efficiency among different
            models, it is not a direct measure of total token cost. Be aware that token consumption
            can vary based on specific interactions, and the burn rate should be used for a rough
            estimation. The extent of your input will have a significant impact on the total token
            consumption.
          </p>
        </div>
        <hr className="my-12 h-0.5 border-t-0 bg-black dark:bg-white/10" />
        <div className="mt-8">
          <h1 className="mb-4 mt-8 text-2xl font-bold ">
            Comparative Analysis of AI Models Across Diverse Benchmarks
          </h1>
          <p>
            The table below compares the performance of various AI models across a range of tasks
            and benchmarks, demonstrating their impressive capabilities in areas such as knowledge,
            reasoning, math problem-solving, and question-answering. Claude 3 Opus consistently
            outperforms other models in most tasks, with GPT-4 and Gemini 1.0 Ultra also showing
            strong performance. The results highlight the effectiveness of different prompting
            techniques and showcase the rapid advancements in AI language models.
          </p>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="overflow-x-auto">
          <table className="w-full table-auto border-collapse border border-gray-400">
            <thead>
              <tr>
                <th className="border border-gray-400 px-4 py-2"></th>
                <th className="border border-gray-400 px-4 py-2">
                  Claude 3<br />
                  Opus
                </th>
                <th className="border border-gray-400 px-4 py-2">
                  Claude 3<br />
                  Sonnet
                </th>
                <th className="border border-gray-400 px-4 py-2">
                  Claude 3<br />
                  Haiku
                </th>
                <th className="border border-gray-400 px-4 py-2">GPT-4</th>
                <th className="border border-gray-400 px-4 py-2">GPT-3.5</th>
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
                  Undergraduate
                  <br />
                  level biology
                  <br />
                  MMLU
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
                  Graduate level
                  <br />
                  reasoning
                  <br />
                  GFVR, Diamond
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
                  Grade school math
                  <br />
                  GSMAR
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
                  Math
                  <br />
                  problem-solving
                  <br />
                  MATH
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
                  Multilingual math
                  <br />
                  MGSM
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
                <td className="border border-gray-400 px-4 py-2">
                  Code
                  <br />
                  HumanEval
                </td>
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
                  Reasoning over text
                  <br />
                  DROP F1 score
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
                  Mixed evaluations
                  <br />
                  Big-bench Hard
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
                <td className="border border-gray-400 px-4 py-2">
                  Knowledge Q&amp;A
                  <br />
                  ARC Challenge
                </td>
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
                  Common
                  <br />
                  Knowledge
                  <br />
                  Demknow
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

          <h3 className="mb-2 text-xl font-bold">GPT-3.5</h3>
          <p className="mb-4">
            A versatile model that performs well in various tasks, although not as strong as its
            more advanced counterparts. Use case: Suitable for general-purpose language tasks and
            applications that don't require the highest level of performance.
          </p>

          <h3 className="mb-2 text-xl font-bold">GPT-4</h3>
          <p className="mb-4">
            A powerful model that closely follows Claude 3 Opus in performance and excels in
            knowledge-based question-answering. Use case: Ideal for tasks that require deep
            understanding, complex reasoning, and extensive knowledge retrieval.
          </p>

          <h3 className="mb-2 text-xl font-bold">Claude 3 Haiku</h3>
          <p className="mb-4">
            A capable model that performs well in code evaluation and reasoning over text. Use case:
            Best suited for tasks involving code analysis, text-based reasoning, and creative
            writing.
          </p>

          <h3 className="mb-2 text-xl font-bold">Claude 3 Sonnet</h3>
          <p className="mb-4">
            A strong performer across multiple domains, slightly behind Claude 3 Opus in most tasks.
            Use case: Suitable for a wide range of applications that require high-quality language
            understanding and generation.
          </p>

          <h3 className="mb-2 text-xl font-bold">Claude 3 Opus</h3>
          <p>
            A highly capable AI model that consistently outperforms others across various
            benchmarks. Use case: Ideal for complex tasks requiring advanced reasoning,
            problem-solving, and knowledge-based question-answering.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AiTokenBurnRates;
