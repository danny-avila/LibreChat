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
  default     = "arn:aws:acm:us-east-1:516744693062:certificate/2f0c0533-1775-4136-9cb1-eac32a3dacd2"
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

data "aws_caller_identity" "current" {}

# Locals
locals {
  env_file_content = file("${path.module}/../.env")
  env_vars = {
    for line in split("\n", local.env_file_content) :
    split("=", line)[0] => split("=", line)[1]
    if length(split("=", line)) == 2 && !startswith(trimsuffix(split("=", line)[0], " "), "#")
  }
  rag_port    = lookup(local.env_vars, "RAG_PORT", "8000")
  commit_hash = trimspace(file("${path.module}/../.git/refs/heads/main"))
}

# ECR Repositories
resource "aws_ecr_repository" "librechat_repo" {
  name = "librechat-repo-parser"
}

resource "aws_ecr_repository" "mongodb_repo" {
  name = "mongodb-repo-parser"
}

resource "aws_ecr_repository" "meilisearch_repo" {
  name = "meilisearch-repo-parser"
}

resource "aws_ecr_repository" "vectordb_repo" {
  name = "vectordb-repo-parser"
}

resource "aws_ecr_repository" "rag_api_repo" {
  name = "rag-api-repo-parser"
}

# Docker image build and push
resource "null_resource" "docker_build_push" {
  provisioner "local-exec" {
    command = <<EOT
      # Set up buildx
      docker buildx create --use

      # Build and push LibreChat
      docker buildx build --platform linux/amd64 -t ${aws_ecr_repository.librechat_repo.repository_url}:${local.commit_hash} -f ${path.module}/../Dockerfile --push ..

      # Pull, tag, and push other images
      docker pull --platform linux/amd64 mongo:latest
      docker pull --platform linux/amd64 getmeili/meilisearch:v1.12.3
      docker pull --platform linux/amd64 ankane/pgvector:latest
      docker pull --platform linux/amd64 ghcr.io/danny-avila/librechat-rag-api-dev-lite:latest

      docker tag mongo:latest ${aws_ecr_repository.mongodb_repo.repository_url}:latest
      docker push ${aws_ecr_repository.mongodb_repo.repository_url}:latest

      docker tag getmeili/meilisearch:v1.12.3 ${aws_ecr_repository.meilisearch_repo.repository_url}:latest
      docker push ${aws_ecr_repository.meilisearch_repo.repository_url}:latest

      docker tag ankane/pgvector:latest ${aws_ecr_repository.vectordb_repo.repository_url}:latest
      docker push ${aws_ecr_repository.vectordb_repo.repository_url}:latest

      docker tag ghcr.io/danny-avila/librechat-rag-api-dev-lite:latest ${aws_ecr_repository.rag_api_repo.repository_url}:latest
      docker push ${aws_ecr_repository.rag_api_repo.repository_url}:latest

      # Verify pushes
      #aws ecr describe-images --repository-name librechat-repo-parser --image-ids imageTag=${local.commit_hash}
      #aws ecr describe-images --repository-name mongodb-repo-parser --image-ids imageTag=latest
      #aws ecr describe-images --repository-name meilisearch-repo-parser --image-ids imageTag=latest
      #aws ecr describe-images --repository-name vectordb-repo-parser --image-ids imageTag=latest
      #aws ecr describe-images --repository-name rag-api-repo-parser --image-ids imageTag=latest
    EOT
  }

  triggers = {
    librechat_dockerfile_hash = filemd5("${path.module}/../Dockerfile")
    commit_hash               = local.commit_hash
  }
}

# ECS Cluster
resource "aws_ecs_cluster" "librechat_cluster" {
  name = "librechat-cluster-parser"
}

# EFS File System
resource "aws_efs_file_system" "librechat_efs" {
  creation_token = "librechat-efs-parser"
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
    gid = 999
    uid = 999
  }
  root_directory {
    path = "/mongodb"
    creation_info {
      owner_gid   = 999
      owner_uid   = 999
      permissions = "700"
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
      permissions = "700"
    }
  }
}

resource "aws_efs_access_point" "vectordb" {
  file_system_id = aws_efs_file_system.librechat_efs.id
  posix_user {
    gid = 999
    uid = 999
  }
  root_directory {
    path = "/vectordb"
    creation_info {
      owner_gid   = 999
      owner_uid   = 999
      permissions = "700"
    }
  }
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "librechat_logs" {
  name              = "/ecs/librechat-parser"
  retention_in_days = 14
}

# Task Definition
resource "aws_ecs_task_definition" "librechat_task" {
  family                   = "librechat-task"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "2048"
  memory                   = "4096"

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  execution_role_arn = aws_iam_role.ecs_execution_role.arn
  task_role_arn      = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name  = "librechat"
      image = "${aws_ecr_repository.librechat_repo.repository_url}:${local.commit_hash}"
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
          readOnly      = false
        },
        {
          sourceVolume  = "logs"
          containerPath = "/app/api/logs"
          readOnly      = false
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
      dependsOn = [
        #{
        #  containerName = "mongodb"
        #  condition     = "HEALTHY"
        #},
        {
          containerName = "meilisearch"
          condition     = "HEALTHY"
        }
      ]
      healthCheck = {
  	command     = ["CMD-SHELL", "curl -f http://localhost:3080/health || exit 1"]
  	interval    = 30
  	timeout     = 5
  	retries     = 3
  	startPeriod = 60
      }
    },
    {
      name  = "mongodb"
      image = "${aws_ecr_repository.mongodb_repo.repository_url}:latest"
      user  = "999:999"
      mountPoints = [
        {
          sourceVolume  = "mongodb_data"
          containerPath = "/data/db"
          readOnly      = false
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
      #healthCheck = {
      #  command     = ["CMD-SHELL", "exit 0"]
      #  interval    = 30
      #  timeout     = 5
      #  retries     = 3
      #  startPeriod = 30
      #}
    },
    {
      name  = "meilisearch"
      image = "${aws_ecr_repository.meilisearch_repo.repository_url}:latest"
      user  = "1000:1000"
      environment = [
        { name = "MEILI_HOST", value = "http://localhost:7700" },
        { name = "MEILI_NO_ANALYTICS", value = "true" },
        { name = "MEILI_MASTER_KEY", value = local.env_vars["MEILI_MASTER_KEY"] }
      ]
      mountPoints = [
        {
          sourceVolume  = "meilisearch_data"
          containerPath = "/meili_data"
          readOnly      = false
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
      healthCheck = {
        command     = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:7700/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 30
      }
    },
    {
      name  = "vectordb"
      image = "${aws_ecr_repository.vectordb_repo.repository_url}:latest"
      user  = "999:999"
      environment = [
        { name = "POSTGRES_DB", value = "mydatabase" },
        { name = "POSTGRES_USER", value = "myuser" },
        { name = "POSTGRES_PASSWORD", value = "mypassword" }
      ]
      mountPoints = [
        {
          sourceVolume  = "vectordb_data"
          containerPath = "/var/lib/postgresql/data"
          readOnly      = false
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.librechat_logs.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs-vectordb"
        }
      }
      healthCheck = {
        command     = ["CMD-SHELL", "pg_isready -U myuser -d mydatabase"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 30
      }
      command = ["/bin/sh", "-c", "chmod 700 /var/lib/postgresql/data && chown postgres:postgres /var/lib/postgresql/data && docker-entrypoint.sh postgres"]
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
          condition     = "HEALTHY"
        }
      ]
    }
  ])

    volume {
    name = "logs"
    efs_volume_configuration {
      file_system_id     = aws_efs_file_system.librechat_efs.id
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
  name            = "parser-librechat-service"
  cluster         = aws_ecs_cluster.librechat_cluster.id
  task_definition = aws_ecs_task_definition.librechat_task.arn
  desired_count   = 1
  launch_type     = "FARGATE"
  #My addition
  platform_version = "1.4.0"

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
  name               = "librechat-alb-parser"
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


# resource "aws_lb_listener" "front_end" {
#   load_balancer_arn = aws_lb.librechat_alb.arn
#   port              = "443"
#   protocol          = "HTTPS"
#   ssl_policy        = "ELBSecurityPolicy-2016-08"
#   certificate_arn   = var.acm_certificate_arn

#   default_action {
#     type = "fixed-response"
#     fixed_response {
#       content_type = "text/plain"
#       message_body = "Invalid hostname"
#       status_code  = "404"
#     }
#   }
# }


# Target Group
resource "aws_lb_target_group" "librechat_tg" {
  name        = "librechat-tg-parser"
  port        = var.app_port
  protocol    = "HTTP"
  vpc_id      = data.aws_vpc.default.id
  target_type = "ip"

  health_check {
    healthy_threshold   = "3"
    interval            = "30"
    protocol            = "HTTP"
    matcher             = "200-299"
    timeout             = "15"
    path                = "/health"
    unhealthy_threshold = "2"
  }
  #health_check {
  #  protocol            = "TCP"
  #  healthy_threshold   = 2
  #  unhealthy_threshold = 10
  #  timeout             = 10
  #  interval            = 30
  #}
}

# Security Group for ALB
resource "aws_security_group" "alb_sg" {
  name        = "allow_https_parser"
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
  name        = "ecs_tasks_sg_parser"
  description = "Allow inbound access from the ALB and EFS access"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description     = "Inbound from ALB"
    protocol        = "tcp"
    from_port       = var.app_port
    to_port         = var.app_port
    security_groups = [aws_security_group.alb_sg.id]
  }

  ingress {
    description = "NFS from self"
    protocol    = "tcp"
    from_port   = 2049
    to_port     = 2049
    self        = true
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
  name        = "efs_sg_parser"
  description = "Allow EFS access from ECS tasks"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description     = "NFS from ECS tasks"
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
  name = "ecs_execution_role_parser"

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

resource "aws_iam_role_policy_attachment" "ecs_execution_ecr_policy" {
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

# IAM Role for ECS Task
resource "aws_iam_role" "ecs_task_role" {
  name = "ecs_task_role_parser"

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
          "elasticfilesystem:ClientWrite",
          "elasticfilesystem:ClientRootAccess"
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

#MY additions!!!!!!
resource "aws_iam_role_policy" "efs_mount_policy_execution_role" {
  name = "efs-mount-policy-execution-role"
  role = aws_iam_role.ecs_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "elasticfilesystem:ClientMount",
          "elasticfilesystem:ClientWrite",
          "elasticfilesystem:ClientRootAccess"
        ]
        Resource = aws_efs_file_system.librechat_efs.arn
      }
    ]
  })
}

#Route 53 DNS configuration
resource "aws_route53_zone" "main" {
  name = "parserdigital.ai"
}


resource "aws_route53_record" "www" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "www.parserdigital.ai"
  type    = "A"

  alias {
    name                   = aws_lb.librechat_alb.dns_name
    zone_id                = aws_lb.librechat_alb.zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "apex" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "parserdigital.ai"
  type    = "A"

  alias {
    name                   = aws_lb.librechat_alb.dns_name
    zone_id                = aws_lb.librechat_alb.zone_id
    evaluate_target_health = true
  }
}

resource "aws_lb_listener_rule" "host_based_routing" {
  listener_arn = aws_lb_listener.front_end.arn
  priority     = 1

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.librechat_tg.arn
  }

  condition {
    host_header {
      values = ["www.parserdigital.ai", "parserdigital.ai"]
    }
  }
}


# Output for debugging
output "env_vars" {
  value     = local.env_vars
  sensitive = true
}

output "rag_port" {
  value = local.rag_port
}

output "commit_hash" {
  value = local.commit_hash
}

output "vpc_id" {
  value = data.aws_vpc.default.id
}