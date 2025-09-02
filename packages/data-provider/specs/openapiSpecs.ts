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

export const scholarAIOpenapiSpec = `
openapi: 3.0.1
info:
  title: ScholarAI
  description: Allows the user to search facts and findings from scientific articles
  version: 'v1'
servers:
  - url: https://scholar-ai.net
paths:
  /api/abstracts:
    get:
      operationId: searchAbstracts
      summary: Get relevant paper abstracts by keywords search
      parameters:
        - name: keywords
          in: query
          description: Keywords of inquiry which should appear in article. Must be in English.
          required: true
          schema:
            type: string
        - name: sort
          in: query
          description: The sort order for results. Valid values are cited_by_count or publication_date. Excluding this value does a relevance based search.
          required: false
          schema:
            type: string
            enum:
              - cited_by_count
              - publication_date
        - name: query
          in: query
          description: The user query
          required: true
          schema:
            type: string
        - name: peer_reviewed_only
          in: query
          description: Whether to only return peer reviewed articles. Defaults to true, ChatGPT should cautiously suggest this value can be set to false
          required: false
          schema:
            type: string
        - name: start_year
          in: query
          description: The first year, inclusive, to include in the search range. Excluding this value will include all years.
          required: false
          schema:
            type: string
        - name: end_year
          in: query
          description: The last year, inclusive, to include in the search range. Excluding this value will include all years.
          required: false
          schema:
            type: string
        - name: offset
          in: query
          description: The offset of the first result to return. Defaults to 0.
          required: false
          schema:
            type: string
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/searchAbstractsResponse'
  /api/fulltext:
    get:
      operationId: getFullText
      summary: Get full text of a paper by URL for PDF
      parameters:
        - name: pdf_url
          in: query
          description: URL for PDF
          required: true
          schema:
            type: string
        - name: chunk
          in: query
          description: chunk number to retrieve, defaults to 1
          required: false
          schema:
            type: number
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/getFullTextResponse'
  /api/save-citation:
    get:
      operationId: saveCitation
      summary: Save citation to reference manager
      parameters:
        - name: doi
          in: query
          description: Digital Object Identifier (DOI) of article
          required: true
          schema:
            type: string
        - name: zotero_user_id
          in: query
          description: Zotero User ID
          required: true
          schema:
            type: string
        - name: zotero_api_key
          in: query
          description: Zotero API Key
          required: true
          schema:
            type: string
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/saveCitationResponse'
components:
  schemas:
    searchAbstractsResponse:
      type: object
      properties:
        next_offset:
          type: number
          description: The offset of the next page of results.
        total_num_results:
          type: number
          description: The total number of results. 
        abstracts:
          type: array
          items:
            type: object
            properties:
              title:
                type: string
              abstract:
                type: string
                description: Summary of the context, methods, results, and conclusions of the paper.
              doi:
                type: string
                description: The DOI of the paper.
              landing_page_url:
                type: string
                description: Link to the paper on its open-access host.
              pdf_url:
                type: string
                description: Link to the paper PDF.
              publicationDate:
                type: string
                description: The date the paper was published in YYYY-MM-DD format.
              relevance:
                type: number
                description: The relevance of the paper to the search query. 1 is the most relevant.
              creators:
                type: array
                items:
                  type: string
                  description: The name of the creator.
              cited_by_count:
                type: number
                description: The number of citations of the article.
          description: The list of relevant abstracts.
    getFullTextResponse:
      type: object
      properties:
        full_text:
          type: string
          description: The full text of the paper.
        pdf_url:
          type: string
          description: The PDF URL of the paper.
        chunk:
          type: number
          description: The chunk of the paper.
        total_chunk_num:
          type: number
          description: The total chunks of the paper.
    saveCitationResponse:
      type: object
      properties:
        message:
          type: string
          description: Confirmation of successful save or error message.`;

export const swapidev = `
openapi: 3.0.3
info:
  title: Star Wars API
  description: This is a simple API that provides information about the Star Wars universe.
  version: 1.0.0
servers:
  - url: https://swapi.dev

paths:
  /api/people:
    get:
      summary: List all people
      operationId: getPeople
      tags:
        - People
      responses:
        '200':
          description: A list of people
          content:
            application/json:
              schema:
                type: object
                properties:
                  count:
                    type: integer
                    example: 82
                  next:
                    type: string
                    nullable: true
                    example: https://swapi.dev/api/people/?page=2
                  previous:
                    type: string
                    nullable: true
                    example: null
                  results:
                    type: array
                    items:
                      $ref: '#/components/schemas/Person'

  /api/people/{id}:
    get:
      summary: Get a person by ID
      operationId: getPersonById
      tags:
        - People
      parameters:
        - name: id
          in: path
          required: true
          description: The ID of the person to retrieve
          schema:
            type: string
      responses:
        '200':
          description: A single person
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Person'
        '404':
          description: Person not found

components:
  schemas:
    Person:
      type: object
      properties:
        name:
          type: string
          example: Luke Skywalker
        height:
          type: string
          example: "172"
        mass:
          type: string
          example: "77"
        hair_color:
          type: string
          example: blond
        skin_color:
          type: string
          example: fair
        eye_color:
          type: string
          example: blue
        birth_year:
          type: string
          example: "19BBY"
        gender:
          type: string
          example: male
        homeworld:
          type: string
          example: https://swapi.dev/api/planets/1/
        films:
          type: array
          items:
            type: string
            example: https://swapi.dev/api/films/1/
        species:
          type: array
          items:
            type: string
            example: https://swapi.dev/api/species/1/
        vehicles:
          type: array
          items:
            type: string
            example: https://swapi.dev/api/vehicles/14/
        starships:
          type: array
          items:
            type: string
            example: https://swapi.dev/api/starships/12/
        created:
          type: string
          format: date-time
          example: 2014-12-09T13:50:51.644000Z
        edited:
          type: string
          format: date-time
          example: 2014-12-20T21:17:56.891000Z
        url:
          type: string
          example: https://swapi.dev/api/people/1/`;
