locals {
  name = var.project
  tags = {
    Project = var.project
    Stack   = "terraform"
  }
}
