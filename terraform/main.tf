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

# Locals
locals {
  env_file_content = file("${path.module}/../.env")
  env_vars = {
    for line in split("\n", local.env_file_content) :
      split("=", line)[0] => split("=", line)[1]
      if length(split("=", line)) == 2 && !startswith(trimsuffix(split("=", line)[0], " "), "#")
  }
  rag_port = lookup(local.env_vars, "RAG_PORT", "8000")
}

# ECR Repositories
resource "aws_ecr_repository" "librechat_repo" {
  name = "librechat-repo"
}

resource "aws_ecr_repository" "mongodb_repo" {
  name = "mongodb-repo"
}

resource "aws_ecr_repository" "meilisearch_repo" {
  name = "meilisearch-repo"
}

resource "aws_ecr_repository" "vectordb_repo" {
  name = "vectordb-repo"
}

resource "aws_ecr_repository" "rag_api_repo" {
  name = "rag-api-repo"
}

# Docker image build and push
resource "null_resource" "docker_build_push" {
  provisioner "local-exec" {
    command = <<EOT
      docker pull mongo:latest
      docker pull getmeili/meilisearch:v1.12.3
      docker pull ankane/pgvector:latest
      docker pull ghcr.io/danny-avila/librechat-rag-api-dev-lite:latest

      docker build -t librechat:latest .

      aws ecr get-login-password --region ${var.aws_region} | docker login --username AWS --password-stdin ${aws_ecr_repository.librechat_repo.repository_url}

      docker tag librechat:latest ${aws_ecr_repository.librechat_repo.repository_url}:latest
      docker push ${aws_ecr_repository.librechat_repo.repository_url}:latest

      docker tag mongo:latest ${aws_ecr_repository.mongodb_repo.repository_url}:latest
      docker push ${aws_ecr_repository.mongodb_repo.repository_url}:latest

      docker tag getmeili/meilisearch:v1.12.3 ${aws_ecr_repository.meilisearch_repo.repository_url}:latest
      docker push ${aws_ecr_repository.meilisearch_repo.repository_url}:latest

      docker tag ankane/pgvector:latest ${aws_ecr_repository.vectordb_repo.repository_url}:latest
      docker push ${aws_ecr_repository.vectordb_repo.repository_url}:latest

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

# EFS Access Points
resource "aws_efs_access_point" "logs" {
  file_system_id = aws_efs_file_system.librechat_efs.id
  posix_user {
    gid = 1000
    uid = 1000
  }
  root_directory {
    path = "/logs"
    creation_info {
      owner_gid   = 1000
      owner_uid   = 1000
      permissions = "755"
    }
  }
}

resource "aws_efs_access_point" "images" {
  file_system_id = aws_efs_file_system.librechat_efs.id
  posix_user {
    gid = 1000
    uid = 1000
  }
  root_directory {
    path = "/images"
    creation_info {
      owner_gid   = 1000
      owner_uid   = 1000
      permissions = "755"
    }
  }
}

resource "aws_efs_access_point" "mongodb" {
  file_system_id = aws_efs_file_system.librechat_efs.id
  posix_user {
    gid = 1000
    uid = 1000
  }
  root_directory {
    path = "/mongodb"
    creation_info {
      owner_gid   = 1000
      owner_uid   = 1000
      permissions = "755"
    }
  }
}

resource "aws_efs_access_point" "meilisearch" {
  file_system_id = aws_efs_file_system.librechat_efs.id
  posix_user {
    gid = 1000
    uid = 1000
  }
  root_directory {
    path = "/meilisearch"
    creation_info {
      owner_gid   = 1000
      owner_uid   = 1000
      permissions = "755"
    }
  }
}

resource "aws_efs_access_point" "vectordb" {
  file_system_id = aws_efs_file_system.librechat_efs.id
  posix_user {
    gid = 1000
    uid = 1000
  }
  root_directory {
    path = "/vectordb"
    creation_info {
      owner_gid   = 1000
      owner_uid   = 1000
      permissions = "755"
    }
  }
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "librechat_logs" {
  name              = "/ecs/librechat"
  retention_in_days = 14
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
      environment = concat([
        { name = "HOST", value = "0.0.0.0" },
        { name = "MONGO_URI", value = "mongodb://localhost:27017/LibreChat" },
        { name = "MEILI_HOST", value = "http://localhost:7700" },
        { name = "RAG_PORT", value = local.rag_port },
        { name = "RAG_API_URL", value = "http://localhost:${local.rag_port}" }
      ], [for k, v in local.env_vars : { name = k, value = v }])
      mountPoints = [
        {
          sourceVolume  = "images"
          containerPath = "/app/client/public/images"
        },
        {
          sourceVolume  = "logs"
          containerPath = "/app/api/logs"
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.librechat_logs.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
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
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.librechat_logs.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
    },
    {
      name  = "meilisearch"
      image = "${aws_ecr_repository.meilisearch_repo.repository_url}:latest"
      environment = [
        { name = "MEILI_HOST", value = "http://localhost:7700" },
        { name = "MEILI_NO_ANALYTICS", value = "true" },
        { name = "MEILI_MASTER_KEY", value = local.env_vars["MEILI_MASTER_KEY"] }
      ]
      mountPoints = [
        {
          sourceVolume  = "meilisearch_data"
          containerPath = "/meili_data"
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.librechat_logs.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
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
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.librechat_logs.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
    },
    {
      name  = "rag_api"
      image = "${aws_ecr_repository.rag_api_repo.repository_url}:latest"
      environment = concat([
        { name = "DB_HOST", value = "localhost" },
        { name = "RAG_PORT", value = local.rag_port },
        { name = "POSTGRES_DB", value = "mydatabase" },
        { name = "POSTGRES_USER", value = "myuser" },
        { name = "POSTGRES_PASSWORD", value = "mypassword" }
      ], [for k, v in local.env_vars : { name = k, value = v }])
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.librechat_logs.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
      dependsOn = [
        {
          containerName = "vectordb"
          condition     = "START"
        }
      ]
    }
  ])

  volume {
    name = "logs"
    efs_volume_configuration {
      file_system_id     = aws_efs_file_system.librechat_efs.id
      root_directory     = "/"
      transit_encryption = "ENABLED"
      authorization_config {
        access_point_id = aws_efs_access_point.logs.id
        iam             = "ENABLED"
      }
    }
  }

  volume {
    name = "images"
    efs_volume_configuration {
      file_system_id     = aws_efs_file_system.librechat_efs.id
      root_directory     = "/"
      transit_encryption = "ENABLED"
      authorization_config {
        access_point_id = aws_efs_access_point.images.id
        iam             = "ENABLED"
      }
    }
  }

  volume {
    name = "mongodb_data"
    efs_volume_configuration {
      file_system_id     = aws_efs_file_system.librechat_efs.id
      root_directory     = "/"
      transit_encryption = "ENABLED"
      authorization_config {
        access_point_id = aws_efs_access_point.mongodb.id
        iam             = "ENABLED"
      }
    }
  }

  volume {
    name = "meilisearch_data"
    efs_volume_configuration {
      file_system_id     = aws_efs_file_system.librechat_efs.id
      root_directory     = "/"
      transit_encryption = "ENABLED"
      authorization_config {
        access_point_id = aws_efs_access_point.meilisearch.id
        iam             = "ENABLED"
      }
    }
  }

  volume {
    name = "vectordb_data"
    efs_volume_configuration {
      file_system_id     = aws_efs_file_system.librechat_efs.id
      root_directory     = "/"
      transit_encryption = "ENABLED"
      authorization_config {
        access_point_id = aws_efs_access_point.vectordb.id
        iam             = "ENABLED"
      }
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

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100
  health_check_grace_period_seconds  = 300

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  depends_on = [aws_lb_listener.front_end, aws_efs_mount_target.librechat_efs_mount]
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

# Security Group Rules for NFS
resource "aws_security_group_rule" "ecs_tasks_nfs_ingress" {
  type                     = "ingress"
  from_port                = 2049
  to_port                  = 2049
  protocol                 = "tcp"
  security_group_id        = aws_security_group.ecs_tasks_sg.id
  source_security_group_id = aws_security_group.efs_sg.id
}

resource "aws_security_group_rule" "efs_nfs_ingress" {
  type                     = "ingress"
  from_port                = 2049
  to_port                  = 2049
  protocol                 = "tcp"
  security_group_id        = aws_security_group.efs_sg.id
  source_security_group_id = aws_security_group.ecs_tasks_sg.id
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

resource "aws_iam_role_policy_attachment" "ecs_execution_role_policy_logs" {
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess"
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

# IAM Policy for ECS Task Role
resource "aws_iam_role_policy" "ecs_task_role_policy" {
  name = "ecs_task_role_policy"
  role = aws_iam_role.ecs_task_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "efs:ClientMount",
          "efs:ClientWrite",
          "elasticfilesystem:ClientMount",
          "elasticfilesystem:ClientWrite"
        ]
        Resource = aws_efs_file_system.librechat_efs.arn
      }
    ]
  })
}

# Output the ALB DNS name
output "alb_dns_name" {
  value       = aws_lb.librechat_alb.dns_name
  description = "The DNS name of the Application Load Balancer"
}

# Output for debugging
output "env_vars" {
  value     = local.env_vars
  sensitive = true
}

output "rag_port" {
  value = local.rag_port
}