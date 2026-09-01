# Certbot Kurulumu (Nginx için SSL)

`site-wizard.sh` SSL adımı için `certbot` ve `python3-certbot-nginx` gerektirir.

## Normal kurulum

```bash
sudo apt install nginx
sudo apt install certbot python3-certbot-nginx
```

## `apt` ile bulunamıyorsa (snap üzerinden kurulum)

1) Eski certbot varsa temizle (opsiyonel ama iyi olur):

```bash
sudo apt remove certbot python3-certbot-nginx -y
```

2) Snapd kurulu mu kontrol et:

```bash
snap version
```

Yoksa kur:

```bash
sudo apt update
sudo apt install snapd -y
```

3) Certbot'u snap ile kur:

```bash
sudo snap install core
sudo snap refresh core
sudo snap install --classic certbot
```

4) Komutu sisteme bağla (çok önemli):

```bash
sudo ln -s /snap/bin/certbot /usr/bin/certbot
```

5) Nginx için SSL al:

```bash
sudo certbot --nginx
```

6) Otomatik yenileme kontrolü:

```bash
sudo certbot renew --dry-run
```

Snap ile kurulan certbot cron'a gerek olmadan otomatik yenilenir ✅
