variable "project"         { type = string  default = "b2b-prueba" }
variable "region"          { type = string  default = "us-east-1" }
variable "vpc_cidr"        { type = string  default = "10.0.0.0/16" }
variable "public_subnets"  { type = list(string) default = ["10.0.1.0/24","10.0.2.0/24"] }
variable "private_subnets" { type = list(string) default = ["10.0.11.0/24","10.0.12.0/24"] }

variable "customers_image" { type = string  description = "ECR image URI for customers-api" }
variable "orders_image"    { type = string  description = "ECR image URI for orders-api" }

variable "desired_count"   { type = number  default = 1 }
variable "container_cpu"   { type = number  default = 256 }
variable "container_mem"   { type = number  default = 512 }

# Secrets (seed values). In real setups set them via CI or import existing secrets.
variable "service_token"        { type = string  default = "internal-service-token" }
variable "jwt_secret"           { type = string  default = "supersecret" }
variable "jwt_token_for_apis"   { type = string  default = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock" }

# DB configuration (use external Aiven by default)
variable "mysql_url"            { type = string  default = "mysql://avnadmin:password@host:16012/defaultdb?ssl-mode=REQUIRED" }
