#!/bin/bash
# CloudPanel reverse proxy portlarını düzenli listeleyen script
# Renkler
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
GRAY='\033[0;90m'
NC='\033[0m'
# Vhost dosyalarından domain -> port eşleşmelerini topla
DATA=$(sudo grep -rHE "proxy_pass\s+https?://[^;]+" /etc/nginx/sites-enabled/ 2>/dev/null \
  | sed -E 's|.*/([^/:]+)\.conf:.*proxy_pass\s+https?://([^/;]+).*|\1|;t;d' \
  > /tmp/.cpports_domains
sudo grep -rhoE "proxy_pass\s+https?://[^/;]+" /etc/nginx/sites-enabled/ 2>/dev/null \
  | sed -E 's|proxy_pass\s+https?://||' \
  > /tmp/.cpports_targets
paste /tmp/.cpports_domains /tmp/.cpports_targets \
  | awk -F'\t' '{
      split($2, a, ":");
      host = a[1];
      port = (length(a[2]) ? a[2] : "80");
      printf "%s\t%s\t%s\n", $1, host, port
    }' \
  | sort -k3 -n -u)
rm -f /tmp/.cpports_domains /tmp/.cpports_targets
# Başlık
echo
printf "${CYAN}%-35s %-18s %-8s${NC}\n" "DOMAIN" "TARGET" "PORT"
printf "${GRAY}%s${NC}\n" "──────────────────────────────────────────────────────────────"
# Satırları yazdır
echo "$DATA" | while IFS=$'\t' read -r domain host port; do
  [ -z "$domain" ] && continue
  printf "${GREEN}%-35s${NC} ${GRAY}%-18s${NC} ${YELLOW}%-8s${NC}\n" "$domain" "$host" "$port"
done
# Özet
TOTAL=$(echo "$DATA" | grep -c .)
echo
printf "${GRAY}Toplam: ${NC}${CYAN}%s${NC} ${GRAY}reverse proxy tanımı${NC}\n" "$TOTAL"
# Kullanılan portları tek satırda
PORTS=$(echo "$DATA" | awk -F'\t' '{print $3}' | sort -un | paste -sd, -)
printf "${GRAY}Kullanılan portlar: ${NC}${YELLOW}%s${NC}\n\n" "$PORTS"
