resource "aws_ecs_cluster" "this" {
  name = "${local.name}-cluster"
  setting {
    name  = "containerInsights"
    value = "disabled"
  }
  tags = local.tags
}

resource "aws_lb" "app" {
  name               = "${local.name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = [for s in aws_subnet.public : s.id]
  tags               = local.tags
}

resource "aws_lb_target_group" "customers" {
  name        = "${local.name}-tg-customers"
  port        = 3001
  protocol    = "HTTP"
  vpc_id      = aws_vpc.this.id
  target_type = "ip"
  health_check {
    path                = "/health"
    interval            = 30
    healthy_threshold   = 2
    unhealthy_threshold = 5
    timeout             = 5
    matcher             = "200-399"
  }
}

resource "aws_lb_target_group" "orders" {
  name        = "${local.name}-tg-orders"
  port        = 3002
  protocol    = "HTTP"
  vpc_id      = aws_vpc.this.id
  target_type = "ip"
  health_check {
    path                = "/health"
    interval            = 30
    healthy_threshold   = 2
    unhealthy_threshold = 5
    timeout             = 5
    matcher             = "200-399"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.app.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Not Found"
      status_code  = "404"
    }
  }
}

resource "aws_lb_listener_rule" "route_customers" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 10
  action { type = "forward" target_group_arn = aws_lb_target_group.customers.arn }
  condition { path_pattern { values = ["/customers*", "/customers/*", "/customers-api*", "/customers-api/*"] } }
}

resource "aws_lb_listener_rule" "route_orders" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 20
  action { type = "forward" target_group_arn = aws_lb_target_group.orders.arn }
  condition { path_pattern { values = ["/orders*", "/orders/*", "/orders-api*", "/orders-api/*"] } }
}

resource "aws_ecs_task_definition" "customers" {
  family                   = "${local.name}-customers"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.container_cpu
  memory                   = var.container_mem
  execution_role_arn       = aws_iam_role.ecs_task_exec.arn
  task_role_arn            = aws_iam_role.ecs_task_exec.arn

  container_definitions = jsonencode([{
    name      = "customers"
    image     = var.customers_image
    essential = true
    portMappings = [{ containerPort = 3001, hostPort = 3001, protocol = "tcp" }]
    environment = [
      { name = "PORT", value = "3001" }
    ]
    secrets = [
      { name = "SERVICE_TOKEN", valueFrom = aws_secretsmanager_secret.service_token.arn }
    ]
    logConfiguration = {
      logDriver = "awslogs",
      options = {
        awslogs-group         = aws_cloudwatch_log_group.ecs.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "customers"
      }
    }
  }])
}

resource "aws_ecs_task_definition" "orders" {
  family                   = "${local.name}-orders"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.container_cpu
  memory                   = var.container_mem
  execution_role_arn       = aws_iam_role.ecs_task_exec.arn
  task_role_arn            = aws_iam_role.ecs_task_exec.arn

  container_definitions = jsonencode([{
    name      = "orders"
    image     = var.orders_image
    essential = true
    portMappings = [{ containerPort = 3002, hostPort = 3002, protocol = "tcp" }]
    environment = [
      { name = "PORT", value = "3002" },
      { name = "CUSTOMERS_API_BASE", value = "http://${aws_lb.app.dns_name}/customers" }
    ]
    secrets = [
      { name = "SERVICE_TOKEN", valueFrom = aws_secretsmanager_secret.service_token.arn },
      { name = "MYSQL_URL",    valueFrom = aws_secretsmanager_secret.mysql_url.arn },
      { name = "JWT_SECRET",   valueFrom = aws_secretsmanager_secret.jwt_secret.arn }
    ]
    logConfiguration = {
      logDriver = "awslogs",
      options = {
        awslogs-group         = aws_cloudwatch_log_group.ecs.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "orders"
      }
    }
    healthCheck = {
      command     = ["CMD-SHELL", "curl -sf http://localhost:3002/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 10
    }
  }])
}

resource "aws_ecs_service" "customers" {
  name            = "${local.name}-customers-svc"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.customers.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"
  network_configuration {
    subnets          = [for s in aws_subnet.public : s.id]
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = true
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.customers.arn
    container_name   = "customers"
    container_port   = 3001
  }
  depends_on = [aws_lb_listener.http]
}

resource "aws_ecs_service" "orders" {
  name            = "${local.name}-orders-svc"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.orders.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"
  network_configuration {
    subnets          = [for s in aws_subnet.public : s.id]
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = true
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.orders.arn
    container_name   = "orders"
    container_port   = 3002
  }
  depends_on = [aws_lb_listener.http]
}
