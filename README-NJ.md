# LibreChat for New Jersey

A LibreChat fork with customizations for the state of New Jersey.

## How to Work in This Repo

### Minimize Upstream Conflicts

While we want to customize the AI experience for New Jersey, we also want to leverage the work from the LibreChat OSS 
community as well.

In order to be able to continue merging upstream LibreChat changes, we need to minimize merge conflict potential:

- **Contribute changes to LibreChat if possible.** If the change is fixing a bug (such as an accessibility issue), then
  merge it directly into LibreChat (both to give back & to minimize our customizations).

- **When adding new code, keep most of the code in a separate NJ-specific file instead of adding the logic inline.**
  E.g., if you want to add some new elements to a page, wrap them in a separate React Component, and just import the 
  Component into the existing file.

- **When removing LibreChat features, find the highest-impact inflection point and comment out the code there.**
  E.g., if there's a setting we want to hide from users, just comment out the component instead of removing the setting
  from the app altogether.

- **Leave comments on modifications to guide anyone needing to handle a merge conflict at that point.** 

### Branching Strategy

We use trunk-based development with a focus on merging changes from upstream. As such, we have two branches:

`main` - mirrors [`LibreChat/main`](https://github.com/danny-avila/LibreChat/tree/main)

`prod` - where our version of LibreChat lives & deploys from

Here's the basic processes:

**Contributing code** - Create a pull request; once finished, squash & rebase it onto `prod`.

**Upstream merges** - Push LibreChat's `main` onto our `main`, then create a merge commit on `prod`. 
Be sure to smoke test before merging!

**Pushing to prod** - *Exact process TBD (but will involve tagging commits on `prod`)* 
