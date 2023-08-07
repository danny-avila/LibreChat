# Pull Request Template


### ⚠️ Pre-Submission Steps:

1. Before starting work, make sure your main branch has the latest commits with `npm run update`
2. Run linting command to find errors: `npm run lint`. Alternatively, ensure husky pre-commit checks are functioning.
3. After your changes, reinstall packages in your current branch using `npm run reinstall` and ensure everything still works. 
    - Restart the ESLint server ("ESLint: Restart ESLint Server" in VS Code command bar) and your IDE after reinstalling or updating.
4. Clear web app localStorage and cookies before and after changes.
5. For frontend changes:
    - Install typescript globally: `npm i -g typescript`.
    - Compile typescript before and after changes to check for introduced errors: `tsc --noEmit`.
6. Run tests locally:
    - Backend unit tests: `npm run test:api`
    - Frontend unit tests: `npm run test:client`
    - Integration tests: `npm run e2e` (requires playwright installed, `npx install playwright`)

## Summary

Please provide a brief summary of your changes and the related issue. Include any motivation and context that is relevant to your changes. If there are any dependencies necessary for your changes, please list them here.

## Change Type

Please delete any irrelevant options.

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] This change requires a documentation update
- [ ] Documentation update 

## Testing

Please describe your test process and include instructions so that we can reproduce your test. If there are any important variables for your testing configuration, list them here.

### **Test Configuration**:

## Checklist

- [ ] My code adheres to this project's style guidelines
- [ ] I have performed a self-review of my own code
- [ ] I have commented in any complex areas of my code
- [ ] I have made pertinent documentation changes
- [ ] My changes do not introduce new warnings
- [ ] I have written tests demonstrating that my changes are effective or that my feature works
- [ ] Local unit tests pass with my changes
- [ ] Any changes dependent on mine have been merged and published in downstream modules.
