#!/bin/bash
# Docker container'ların port haritalarını düzenli listeleyen script
# Renkler
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
GRAY='\033[0;90m'
RED='\033[0;31m'
NC='\033[0m'
# Docker var mı?
if ! command -v docker &> /dev/null; then
    printf "${RED}Docker bulunamadı.${NC}\n"
    exit 1
fi
# Çalışan container sayısı
RUNNING_COUNT=$(docker ps -q | wc -l)
if [ "$RUNNING_COUNT" -eq 0 ]; then
    printf "${YELLOW}Çalışan container yok.${NC}\n"
    exit 0
fi
# Başlık
echo
printf "${CYAN}%-28s %-28s %-24s %-12s${NC}\n" "CONTAINER" "IMAGE" "HOST" "→ CONTAINER"
printf "${GRAY}%s${NC}\n" "──────────────────────────────────────────────────────────────────────────────────────────────"
# Process substitution ile subshell sorununu engelle
while IFS='|' read -r name image ports; do
    if [ -z "$ports" ]; then
        printf "${GREEN}%-28s${NC} ${GRAY}%-28s${NC} ${GRAY}%-24s${NC} ${GRAY}%-12s${NC}\n" \
            "$name" "$image" "(port yok)" "-"
        continue
    fi
    first=true
    while read -r port_map; do
        port_map=$(echo "$port_map" | xargs)
        [ -z "$port_map" ] && continue
        # IPv6 :::PORT olanları atla, IPv4 zaten geliyor
        [[ "$port_map" == :::* ]] && continue
        if [[ "$port_map" == *"->"* ]]; then
            host_part="${port_map%%->*}"
            container_part="${port_map##*->}"
        else
            host_part="(yalnız expose)"
            container_part="$port_map"
        fi
        if $first; then
            printf "${GREEN}%-28s${NC} ${GRAY}%-28s${NC} ${YELLOW}%-24s${NC} ${CYAN}%-12s${NC}\n" \
                "$name" "$image" "$host_part" "$container_part"
            first=false
        else
            printf "%-28s %-28s ${YELLOW}%-24s${NC} ${CYAN}%-12s${NC}\n" \
                "" "" "$host_part" "$container_part"
        fi
    done < <(echo "$ports" | tr ',' '\n')
done < <(docker ps --format '{{.Names}}|{{.Image}}|{{.Ports}}')
# Özet
echo
HOST_PORTS=$(docker ps --format '{{.Ports}}' \
    | tr ',' '\n' \
    | grep -oE '(^|[^:]):([0-9]+)->' \
    | grep -oE '[0-9]+' \
    | sort -un \
    | paste -sd, -)
printf "${GRAY}Toplam: ${NC}${CYAN}%s${NC} ${GRAY}çalışan container${NC}\n" "$RUNNING_COUNT"
if [ -n "$HOST_PORTS" ]; then
    printf "${GRAY}Kullanılan host portları: ${NC}${YELLOW}%s${NC}\n" "$HOST_PORTS"
fi
echo
