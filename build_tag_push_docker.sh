docker build --platform linux/amd64 -t librechat .
docker tag librechat:latest 730335261767.dkr.ecr.us-east-1.amazonaws.com/librechat:latest
docker push 730335261767.dkr.ecr.us-east-1.amazonaws.com/librechat:latest
