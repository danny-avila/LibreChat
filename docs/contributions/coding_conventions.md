# Coding Conventions

## Node.js API Server

### 1. General Guidelines

- Follow the [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript) for general JavaScript coding conventions.
- Use "clean code" principles, such as keeping functions and modules small, adhering to the single responsibility principle, and writing expressive and readable code.
- Use meaningful and descriptive variable and function names.
- Prioritize code readability and maintainability over brevity.
- Use the provided .eslintrc and .prettierrc files for consistent code formatting.
- Use CommonJS modules (require/exports) for Node.js modules.
- Organize and modularize the codebase using separate files for different concerns.   

### 2. API Design

- Follow RESTful principles when designing APIs.
- Use meaningful and descriptive names for routes, controllers, services, and models.
- Use appropriate HTTP methods (GET, POST, PUT, DELETE) for each route.
- Use proper status codes and response structures for consistent API responses (ie. 2xx for success, 4xx for bad request from client, 5xx for server error, etc.).
- Use try-catch blocks to catch and handle exceptions gracefully.
- Implement proper error handling and consistently return appropriate error responses.
- Use the logging system included in the `utils` directory to log important events and errors. 
- Do JWT-based, stateless authentication using the `requireJWTAuth` middleware.

### 3. File Structure

*Note: The API is undergoing a refactor to separate out the code for improved separation of concerns, testability, and maintainability. Any new APIs must follow the structure using the auth system as an example, which separates out the routes, controllers, services, and models into separate files.*

#### Routes

Specifies each http request method, any middleware to be used, and the controller function to be called for each route.

- Define routes using the Express Router in separate files for each resource or logical grouping.
- Use descriptive route names and adhere to RESTful conventions.
- Keep routes concise and focused on a single responsibility.
- Prefix all routes with the /api namespace.
  
#### Controllers

Contains the logic for each route, including calling the appropriate service functions and returning the appropriate response status code and JSON body.

- Create a separate controller file for each route to handle the request/response logic.
- Name controller files using the PascalCase convention and append "Controller" to the file name (e.g., UserController.js).
- Use controller methods to encapsulate logic related to the route handling.
- Keep controllers thin by delegating complex operations to service or model files.

#### Services

Contains complex business logic or operations shared across multiple controllers.

- Name service files using the PascalCase convention and append "Service" to the file name (e.g., AuthService.js).
- Avoid tightly coupling services to specific models or databases for better reusability.
- Maintain a single responsibility principle within each service.
  
#### Models

Defines Mongoose models to represent data entities and their relationships.

- Use singular, PascalCase names for model files and their associated collections (e.g., User.js and users collection).
- Include only the necessary fields, indexes, and validations in the models.
- Keep models independent of the API layer by avoiding direct references to request/response objects.

### 4. Database Access (MongoDB and Mongoose)

- Use Mongoose (https://mongoosejs.com) as the MongoDB ODM.
- Create separate model files for each entity and ensure clear separation of concerns.
- Use Mongoose schema validation to enforce data integrity.
- Handle database connections efficiently and avoid connection leaks.
- Use Mongoose query builders to create concise and readable database queries.

### 5. Testing and Documentation

*Note: the repo currently lacks sufficient automated unit and integration tests for both the client and the API. This is a great first issue for new contributors wanting to familiarize with the codebase.*

- Write unit tests for all critical and complex functionalities using Jest.
- Write integration tests for all API endpoints using Supertest.
- Write end-to-end tests for all client-side functionalities using Playwright.
- Use descriptive test case and function names to clearly express the test's purpose.
- Document the code using JSDoc comments to provide clear explanations of functions, parameters, and return types. (WIP)


## React Client

### General TypeScript and React Best Practices

- Use [TypeScript best practices](https://onesignal.com/blog/effective-typescript-for-react-applications/) to benefit from static typing and improved tooling.
- Group related files together within folders.
- Name components using the PascalCase convention.
- Use concise and descriptive names that accurately reflect the component's purpose.
- Split complex components into smaller, reusable ones when appropriate.
- Keep the rendering logic within components minimal.
- Extract reusable parts into separate functions or hooks.
- Apply prop type definitions using TypeScript types or interfaces.
- Use form validation where appropriate. (note: we use [React Hook Form](https://react-hook-form.com/) for form validation and submission)

### Data Services

Use the conventions found in the `data-provider` directory for handling data services. For more information, see [this article](https://www.danorlandoblog.com/chatgpt-clone-data-services-with-react-query/) which describes the methodology used.

### State Management

Use [Recoil](https://recoiljs.org/) for state management, but *DO NOT pollute the global state with unnecessary data*. Instead, use local state or props for data that is only used within a component or passed down from parent to child.
  
##

## [Go Back to ReadMe](../../README.md)