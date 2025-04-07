

### Development setup
#### Run backend in vscode dev container
`ci` if needed

`npm run backend:dev`

#### Run frontend
`cd client/`

`npm i && npm run build` if needed

`npm run dev` to run

http://localhost:3090 to run


### Rebase with upstream
if needed: `git remote add upstream https://github.com/danny-avila/LibreChat.git` (`git remote -v` to view upstream)

`git fetch upstream` 

`git rebase upstream/main`

`git add ... && git commit ...`

`git rebase --continue`

`git push -f`

`npm ci`

`npm run frontend`


## Install

`npm ci`

`npm run frontend`


### Linux command to Remove all existing images
docker images -a | grep "librechat" | awk '{print $3}' | xargs docker rmi

then https://www.librechat.ai/docs/local/docker#update-librechat


### Update on server
```
sudo docker compose down --remove-orphans && \
sudo docker images -a | grep "librechat" | awk '{print $3}' | sudo xargs docker rmi -f && \
sudo docker compose up -d --build --force-recreate
```



## Misc
* Filter out models from model select in `useEndpoints.ts`
