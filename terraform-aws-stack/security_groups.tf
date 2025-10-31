resource "aws_security_group" "alb" {
  name   = "${local.name}-alb-sg"
  vpc_id = aws_vpc.this.id
  ingress { from_port = 80 to_port = 80 protocol = "tcp" cidr_blocks = ["0.0.0.0/0"] }
  egress  { from_port = 0  to_port = 0  protocol = "-1" cidr_blocks = ["0.0.0.0/0"] }
  tags = local.tags
}

resource "aws_security_group" "ecs_tasks" {
  name   = "${local.name}-ecs-sg"
  vpc_id = aws_vpc.this.id
  ingress { from_port = 3001 to_port = 3002 protocol = "tcp" security_groups = [aws_security_group.alb.id] }
  egress  { from_port = 0    to_port = 0    protocol = "-1" cidr_blocks = ["0.0.0.0/0"] }
  tags = local.tags
}
