# Dev
This directory contains files used for developer work

### Dockerfile-app: 
- used to build the DockerHub image
### eslintrc-stripped.js:
- alternate linting rules, used in development
### meilisearch.yml: 
- Dockerfile for building meilisearch image independently from project
### single-compose.yml: 
- Dockerfile for building app image without meilisearch and mongodb services
  - This is useful for deploying on Google, Azure, etc., as a single, leaner container.
- From root dir of the project, run `docker-compose -f ./docs/dev/single-compose.yml up --build`
  - When you don't need to build, run `docker-compose -f ./docs/dev/single-compose.yml up`
- This requires you use a MongoDB Atlas connection string for the `MONGO_URI` env var
  - A URI string to a mongodb service accessible to your container is also possible.
  - Remote Meilisearch may also be possible in the same manner, but is not tested.