provider "aws" {
  region = "ap-southeast-1"
}

# 1. Dynamically fetch the latest official Ubuntu 22.04 AMI
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # official AWS account ID

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }
}

# 2. The WebRTC Firewall (Security Group)
resource "aws_security_group" "webrtc_sg" {
  name        = "cloud-console-sg"
  description = "Allow WebRTC and Node.js traffic"

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] 
  }

  ingress {
    description = "Node.js Switchboard"
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "WebRTC UDP Video/Audio"
    from_port   = 1024
    to_port     = 65535
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# 3. The Server (EC2 Instance)
resource "aws_instance" "cloud_console" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = "t2.micro" 

  vpc_security_group_ids = [aws_security_group.webrtc_sg.id]
  
  # key_name = "cloud-console-key" 

  # 4. Auto-install Docker on boot
  user_data = <<-EOF
              #!/bin/bash
              apt-get update -y
              apt-get install -y docker.io docker-compose-v2
              systemctl start docker
              systemctl enable docker
              usermod -aG docker ubuntu
              EOF

  tags = {
    Name = "WebRTC-Cloud-Console"
  }
}

output "server_public_ip" {
  value = aws_instance.cloud_console.public_ip
}