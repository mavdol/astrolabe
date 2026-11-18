resource "aws_launch_template" "api" {
  name_prefix   = "orders-api-"
  image_id      = var.ami
  instance_type = "m6i.large"
}

resource "aws_autoscaling_group" "api" {
  desired_capacity = 4
  max_size         = 8
  min_size         = 2
  launch_template {
    id = aws_launch_template.api.id
  }
}
