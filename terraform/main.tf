# Provider configuration
provider "aws" {
  region = var.aws_region
}

# Variables
variable "aws_region" {
  default = "us-east-1"
}

variable "app_port" {
  default = 3080
}

variable "acm_certificate_arn" {
  description = "ARN of the existing ACM certificate"
  type        = string
  default     = "arn:aws:acm:us-east-1:063353344768:certificate/e4345b66-7639-4c58-a6c6-eebd1575ae60"
}

# Data sources
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# ECR Repositories
resource "aws_ecr_repository" "librechat_repo" {
  name = "librechat-repo"
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_ecr_repository" "mongodb_repo" {
  name = "mongodb-repo"
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_ecr_repository" "meilisearch_repo" {
  name = "meilisearch-repo"
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_ecr_repository" "vectordb_repo" {
  name = "vectordb-repo"
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_ecr_repository" "rag_api_repo" {
  name = "rag-api-repo"
  lifecycle {
    prevent_destroy = true
  }
}

# Docker image build and push
resource "null_resource" "docker_build_push" {
  provisioner "local-exec" {
    command = <<EOT
      # Pull images
      docker pull mongo:latest
      docker pull getmeili/meilisearch:v1.12.3
      docker pull ankane/pgvector:latest
      docker pull ghcr.io/danny-avila/librechat-rag-api-dev-lite:latest

      # Build LibreChat image
      docker build -t librechat:latest .

      # Login to ECR
      aws ecr get-login-password --region ${var.aws_region} | docker login --username AWS --password-stdin ${aws_ecr_repository.librechat_repo.repository_url}

      # Tag and push LibreChat
      docker tag librechat:latest ${aws_ecr_repository.librechat_repo.repository_url}:latest
      docker push ${aws_ecr_repository.librechat_repo.repository_url}:latest

      # Tag and push MongoDB
      docker tag mongo:latest ${aws_ecr_repository.mongodb_repo.repository_url}:latest
      docker push ${aws_ecr_repository.mongodb_repo.repository_url}:latest

      # Tag and push Meilisearch
      docker tag getmeili/meilisearch:v1.12.3 ${aws_ecr_repository.meilisearch_repo.repository_url}:latest
      docker push ${aws_ecr_repository.meilisearch_repo.repository_url}:latest

      # Tag and push Vectordb
      docker tag ankane/pgvector:latest ${aws_ecr_repository.vectordb_repo.repository_url}:latest
      docker push ${aws_ecr_repository.vectordb_repo.repository_url}:latest

      # Tag and push RAG API
      docker tag ghcr.io/danny-avila/librechat-rag-api-dev-lite:latest ${aws_ecr_repository.rag_api_repo.repository_url}:latest
      docker push ${aws_ecr_repository.rag_api_repo.repository_url}:latest
    EOT
  }

  triggers = {
    librechat_dockerfile_hash = filemd5("${path.module}/../Dockerfile")
  }
}

# ECS Cluster
resource "aws_ecs_cluster" "librechat_cluster" {
  name = "librechat-cluster"
}

# EFS File System
resource "aws_efs_file_system" "librechat_efs" {
  creation_token = "librechat-efs"
  encrypted      = true
}

# EFS Mount Targets
resource "aws_efs_mount_target" "librechat_efs_mount" {
  count           = length(data.aws_subnets.default.ids)
  file_system_id  = aws_efs_file_system.librechat_efs.id
  subnet_id       = data.aws_subnets.default.ids[count.index]
  security_groups = [aws_security_group.efs_sg.id]
}

# Task Definition
resource "aws_ecs_task_definition" "librechat_task" {
  family                   = "librechat-task"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "1024"
  memory                   = "2048"

  execution_role_arn = aws_iam_role.ecs_execution_role.arn
  task_role_arn      = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name  = "librechat"
      image = "${aws_ecr_repository.librechat_repo.repository_url}:latest"
      portMappings = [
        {
          containerPort = var.app_port
          hostPort      = var.app_port
        }
      ]
      environment = [
        { name = "MONGO_URI", value = "mongodb://localhost:27017/LibreChat" },
        { name = "MEILI_HOST", value = "http://localhost:7700" },
        { name = "RAG_API_URL", value = "http://localhost:8000" }
      ]
    },
    {
      name  = "mongodb"
      image = "${aws_ecr_repository.mongodb_repo.repository_url}:latest"
      mountPoints = [
        {
          sourceVolume  = "mongodb_data"
          containerPath = "/data/db"
        }
      ]
    },
    {
      name  = "meilisearch"
      image = "${aws_ecr_repository.meilisearch_repo.repository_url}:latest"
      environment = [
        { name = "MEILI_NO_ANALYTICS", value = "true" }
      ]
      mountPoints = [
        {
          sourceVolume  = "meilisearch_data"
          containerPath = "/meili_data"
        }
      ]
    },
    {
      name  = "vectordb"
      image = "${aws_ecr_repository.vectordb_repo.repository_url}:latest"
      environment = [
        { name = "POSTGRES_DB", value = "mydatabase" },
        { name = "POSTGRES_USER", value = "myuser" },
        { name = "POSTGRES_PASSWORD", value = "mypassword" }
      ]
      mountPoints = [
        {
          sourceVolume  = "vectordb_data"
          containerPath = "/var/lib/postgresql/data"
        }
      ]
    },
    {
      name  = "rag_api"
      image = "${aws_ecr_repository.rag_api_repo.repository_url}:latest"
      environment = [
        { name = "DB_HOST", value = "localhost" },
        { name = "RAG_PORT", value = "8000" }
      ]
    }
  ])

  volume {
    name = "mongodb_data"
    efs_volume_configuration {
      file_system_id = aws_efs_file_system.librechat_efs.id
      root_directory = "/mongodb"
    }
  }

  volume {
    name = "meilisearch_data"
    efs_volume_configuration {
      file_system_id = aws_efs_file_system.librechat_efs.id
      root_directory = "/meilisearch"
    }
  }

  volume {
    name = "vectordb_data"
    efs_volume_configuration {
      file_system_id = aws_efs_file_system.librechat_efs.id
      root_directory = "/vectordb"
    }
  }

  depends_on = [null_resource.docker_build_push]
}

# ECS Service
resource "aws_ecs_service" "librechat_service" {
  name            = "librechat-service"
  cluster         = aws_ecs_cluster.librechat_cluster.id
  task_definition = aws_ecs_task_definition.librechat_task.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    assign_public_ip = true
    security_groups  = [aws_security_group.ecs_tasks_sg.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.librechat_tg.arn
    container_name   = "librechat"
    container_port   = var.app_port
  }

  depends_on = [aws_lb_listener.front_end]
}

# Application Load Balancer
resource "aws_lb" "librechat_alb" {
  name               = "librechat-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb_sg.id]
  subnets            = data.aws_subnets.default.ids
}

# ALB Listener
resource "aws_lb_listener" "front_end" {
  load_balancer_arn = aws_lb.librechat_alb.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-2016-08"
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.librechat_tg.arn
  }
}

# Target Group
resource "aws_lb_target_group" "librechat_tg" {
  name        = "librechat-tg"
  port        = var.app_port
  protocol    = "HTTP"
  vpc_id      = data.aws_vpc.default.id
  target_type = "ip"

  health_check {
    healthy_threshold   = "3"
    interval            = "30"
    protocol            = "HTTP"
    matcher             = "200"
    timeout             = "3"
    path                = "/"
    unhealthy_threshold = "2"
  }
}

# Security Group for ALB
resource "aws_security_group" "alb_sg" {
  name        = "allow_https"
  description = "Allow HTTPS inbound traffic"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "HTTPS from anywhere"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Security Group for ECS Tasks
resource "aws_security_group" "ecs_tasks_sg" {
  name        = "ecs_tasks_sg"
  description = "Allow inbound access from the ALB only"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    protocol        = "tcp"
    from_port       = var.app_port
    to_port         = var.app_port
    security_groups = [aws_security_group.alb_sg.id]
  }

  egress {
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Security Group for EFS
resource "aws_security_group" "efs_sg" {
  name        = "efs_sg"
  description = "Allow EFS access from ECS tasks"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    protocol        = "tcp"
    from_port       = 2049
    to_port         = 2049
    security_groups = [aws_security_group.ecs_tasks_sg.id]
  }

  egress {
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# IAM Role for ECS Task Execution
resource "aws_iam_role" "ecs_execution_role" {
  name = "ecs_execution_role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution_role_policy" {
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# IAM Role for ECS Task
resource "aws_iam_role" "ecs_task_role" {
  name = "ecs_task_role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

# Output the ALB DNS name
output "alb_dns_name" {
  value       = aws_lb.librechat_alb.dns_name
  description = "The DNS name of the Application Load Balancer"
}