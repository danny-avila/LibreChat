# Formaacquae assistant
Intro


# Github - Upstream sync

To sync our fork with the main LibreChat repository, follow these steps: 

1.  **Clone the repository from [LibreChat](https://github.com/danny-avila/LibreChat)**  
```git clone git@github.com:danny-avila/LibreChat.git ``` 
2.  **Add the original repository as "upstream"**  
```git remote add upstream git@github.com:danny-avila/LibreChat.git ``` 
3.   **Verify the remote configuration**  
```git remote -v ``` 
4.   **Create a new branch and switch to it**  
```git switch -c sync_from_upstream ```
5. **Pull changes from the "upstream" repository to your local copy**
```git pull --no-rebase upstream main ```
 6. **Resolve any conflicts and then push all commits to your fork**  
 ```git push --set-upstream origin sync_from_upstream ```
 7. **Create a Pull Request using the GitHub UI**  Navigate to your repository on GitHub, create a Pull Request from the `sync_from_upstream` branch to the `main` branch.
 8. **Merge the Pull Request**  Once the Pull Request is approved, merge it into the `main` branch. 
 9.  **Cleanup**  You can now safely delete the `sync_from_upstream` branch, as the `main` branch is updated: 
 ```git branch -d sync_from_upstream ``` 

By following these steps, your fork will be synchronized with the main repository, ensuring you have an up-to-date codebase.

# Librechat  tools

Start and stop Librechat in docker (need to be in the correct folder)

    npm run start_deployed
    npm run stop:deployed

Create new user:

    npm run create-user
 
