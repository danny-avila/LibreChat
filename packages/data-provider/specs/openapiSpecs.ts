import { OpenAPIV3 } from 'openapi-types';

export type FlowchartSchema = {
  mermaid: {
    type: 'string';
    description: 'Flowchart to be rendered, in Mermaid syntax';
  };
  title: {
    type: 'string';
    description: 'Title of the flowchart';
  };
};

export const getWeatherOpenapiSpec: OpenAPIV3.Document = {
  openapi: '3.1.0',
  info: {
    title: 'Get weather data',
    description: 'Retrieves current weather data for a location.',
    version: 'v1.0.0',
  },
  servers: [
    {
      url: 'https://weather.example.com',
    },
  ],
  paths: {
    '/location': {
      get: {
        description: 'Get temperature for a specific location',
        operationId: 'GetCurrentWeather',
        parameters: [
          {
            name: 'location',
            in: 'query',
            description: 'The city and state to retrieve the weather for',
            required: true,
            schema: {
              type: 'string',
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  locations: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        city: {
                          type: 'string',
                          example: 'San Francisco',
                        },
                        state: {
                          type: 'string',
                          example: 'CA',
                        },
                        countryCode: {
                          type: 'string',
                          description: 'ISO 3166-1 alpha-2 country code',
                          example: 'US',
                        },
                        time: {
                          type: 'string',
                          description:
                            'Optional time for which the weather is requested, in ISO 8601 format.',
                          example: '2023-12-04T14:00:00Z',
                        },
                      },
                      required: ['city', 'state', 'countryCode'],
                      description:
                        'Details of the location for which the weather data is requested.',
                    },
                    description: 'A list of locations to retrieve the weather for.',
                  },
                },
              },
            },
          },
        },
        deprecated: false,
        responses: {},
      },
    },
  },
  components: {
    schemas: {},
  },
};

export const whimsicalOpenapiSpec: OpenAPIV3.Document = {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'Diagram to Image API',
    description: 'A simple API to generate flowchart, mindmap, or sequence diagram images.',
  },
  servers: [{ url: 'https://whimsical.com/api' }],
  paths: {
    '/ai.chatgpt.render-flowchart': {
      post: {
        operationId: 'postRenderFlowchart',
        // 'x-openai-isConsequential': false,
        summary: 'Renders a flowchart',
        description:
          'Accepts a string describing a flowchart and returns a URL to a rendered image',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/FlowchartRequest',
              },
            },
          },
          required: true,
        },
        responses: {
          '200': {
            description: 'URL to the rendered image',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/FlowchartResponse',
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      FlowchartRequest: {
        type: 'object',
        properties: {
          mermaid: {
            type: 'string',
            description: 'Flowchart to be rendered, in Mermaid syntax',
          },
          title: {
            type: 'string',
            description: 'Title of the flowchart',
          },
        },
        required: ['mermaid'],
      },
      FlowchartResponse: {
        type: 'object',
        properties: {
          imageURL: {
            type: 'string',
            description: 'URL of the rendered image',
          },
        },
      },
    },
  },
};
