#!/bin/bash
CYAN='\033[1;36m'
NC='\033[0m'
printf "${CYAN}═══ NGINX REVERSE PROXY ═══${NC}\n"
/home/ubuntu/show-ports.sh
printf "${CYAN}═══ DOCKER CONTAINERS ═══${NC}\n"
/home/ubuntu/docker-ports.sh
