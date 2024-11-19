# AI Rules and Guidelines for LibreChat Development

This document outlines the rules, best practices, and guidelines that AI must follow when assisting with the development of the [REDACTED] MERN stack project.

## 1. Memlog System

- Always create/verify the 'memlog' folder when starting any project.
- The memlog folder must contain: tasks.log, changelog.md, stability_checklist.md, and url_debug_checklist.md.
- Verify and update these files before providing any responses or taking any actions.
- Use these logs to track user progress, system state, and persistent data between conversations.

## 2. Task Breakdown and Execution

- Break down all user instructions into clear, numbered steps.
- Include both actions and reasoning for each step.
- Flag potential issues before they arise.
- Verify the completion of each step before proceeding to the next.
- If errors occur, document them, return to previous steps, and retry as needed.

## 3. Credential Management

- Explain the purpose of each credential when requesting from users.
- Guide users to obtain any missing credentials.
- Always test the validity of credentials before using them.
- Never store credentials in plaintext; use environment variables.
- Implement proper refresh procedures for expiring credentials.
- Provide guidance on secure credential storage methods.

## 4. Code Structure and Organization

- Keep files small and modular.
- Split large components into smaller, manageable parts.
- Move constants, configurations, and long strings to separate files.
- Use descriptive names for files, functions, and variables.
- Document all file dependencies and maintain a clean project structure.

## 5. Error Handling and Reporting

- Implement detailed and actionable error reporting.
- Log errors with context and timestamps.
- Provide users with clear steps for error recovery.
- Track error history to identify patterns.
- Implement escalation procedures for unresolved issues.
- Ensure all systems have robust error handling mechanisms.

## 6. Third-Party Services Integration

- Verify that the user has completed all setup requirements for each service.
- Check all necessary permissions and settings.
- Test service connections before using them in workflows.
- Document version requirements and service dependencies.
- Prepare contingency plans for potential service outages or failures.

## 7. Dependencies and Libraries

- Always use the most stable versions of dependencies to ensure compatibility.
- Regularly update libraries, avoiding changes that might disrupt functionality.

## 8. Code Documentation

- Write clear, concise comments for all sections of code.
- Use only one set of triple quotes for docstrings to prevent syntax errors.
- Document the purpose and expected behavior of functions and modules.

## 9. Change Management

- Review all changes to assess their impact on other parts of the project.
- Test changes thoroughly to ensure consistency and prevent conflicts.
- Document all changes, their outcomes, and any corrective actions in the changelog.

## 10. Problem-Solving Approach

- Exhaust all options before determining an action is impossible.
- When evaluating feasibility, check alternatives in all directions: up/down and left/right.
- Only conclude an action cannot be performed after all possibilities have been tested.

## 11. Testing and Quality Assurance

- Implement comprehensive unit tests for all components.
- Perform integration testing to ensure different parts of the system work together.
- Conduct thorough end-to-end testing to validate user workflows.
- Maintain high test coverage and document it in the stability_checklist.md.

## 12. Security Best Practices

- Implement proper authentication and authorization mechanisms.
- Use secure communication protocols (HTTPS) for all network interactions.
- Sanitize and validate all user inputs to prevent injection attacks.
- Regularly update dependencies to patch known vulnerabilities.
- Follow the principle of least privilege in system design.

## 13. Performance Optimization

- Optimize database queries for efficiency.
- Implement caching strategies where appropriate.
- Minimize network requests and payload sizes.
- Use asynchronous operations for I/O-bound tasks.
- Regularly profile the application to identify and address performance bottlenecks.

## 14. Compliance and Standards

- Ensure the application complies with relevant data protection regulations (e.g., GDPR, CCPA).
- Follow accessibility standards (WCAG) to make the application usable by people with disabilities.
- Adhere to industry-standard coding conventions and style guides.

## 15. Documentation

- Maintain up-to-date API documentation.
- Provide clear, step-by-step guides for setup and deployment.
- Document known issues and their workarounds in the stability_checklist.md.
- Keep user guides and FAQs current with each feature update.

Remember, these rules and guidelines must be followed without exception. Always refer back to this document when making decisions or providing assistance during the development process.
