ENVIRONMENT := test
VERSION := "v0.7.8"

prepare:
	cp .env.example .env

deploy:
	helm dependency update ./helm/librechat
	helm upgrade --namespace chat-$(ENVIRONMENT) --install --force --dependency-update chat ./helm/librechat

build: build-api build-node
	echo "Build completed successfully."

push: push-api push-node
	docker tag chat-api:latest 512321045899.dkr.ecr.eu-west-1.amazonaws.com/chat:api-$(VERSION)
	docker tag chat:latest 512321045899.dkr.ecr.eu-west-1.amazonaws.com/chat:chat-$(VERSION)
	docker push 512321045899.dkr.ecr.eu-west-1.amazonaws.com/chat:api-$(VERSION)
	docker push 512321045899.dkr.ecr.eu-west-1.amazonaws.com/chat:chat-$(VERSION)

build-api: prepare
	docker build --file Dockerfile.multi --target api-build --platform linux/amd64,linux/arm64 --tag chat-api:latest .

push-api: build-api
	docker tag chat-api:latest 512321045899.dkr.ecr.eu-west-1.amazonaws.com/chat:api-latest
	docker push 512321045899.dkr.ecr.eu-west-1.amazonaws.com/chat:api-latest

build-node: prepare
	docker build --file Dockerfile --target node --platform linux/amd64,linux/arm64 --tag chat:latest .

push-node: build-node
	docker tag chat:latest 512321045899.dkr.ecr.eu-west-1.amazonaws.com/chat:chat-latest
	docker push 512321045899.dkr.ecr.eu-west-1.amazonaws.com/chat:chat-latest
