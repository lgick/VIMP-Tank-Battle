#!/bin/bash
set -e

# ====== Настройки ======
EMAIL="mail@lgick.space"       # Почта для certbot
DOMAIN="vimp.lgick.space"            # Домен сайта
PROJECT_DIR="/var/www/$DOMAIN"       # Путь до проекта
GIT_REPO="https://github.com/lgick/VIMP-Tank-Battle.git"  # Репозиторий проекта

# ====== Обновление системы ======
echo "Обновление системы..."
sudo apt update
sudo apt upgrade -y

# ====== Установка Nginx, Brotli и Git ======
echo "Установка Nginx, Brotli и Git..."
sudo apt install -y nginx-full libnginx-mod-http-brotli-filter libnginx-mod-http-brotli-static git curl

# ====== Установка Node.js 22 ======
echo "Установка Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
npm install -g npm@latest

# ====== Настройка проекта ======
echo "Настройка проекта..."
sudo mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"
if [ ! -d ".git" ]; then
    sudo git clone "$GIT_REPO" .
else
    echo "Репозиторий уже клонирован"
fi
sudo npm install
sudo npm run build

# ====== Установка и настройка pm2 ======
echo "Установка pm2..."
sudo npm install -g pm2@latest
sudo pm2 startup systemd -u $USER --hp $HOME
sudo pm2 start npm --name vimp-game -- run start
sudo pm2 save

# ====== Установка Certbot и генерация SSL ======
echo "Установка Certbot и получение SSL..."
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL"

# ====== Настройка Nginx ======
echo "Настройка Nginx..."
sudo rm -f /etc/nginx/sites-enabled/default
sudo curl -o /etc/nginx/sites-available/$DOMAIN.conf https://raw.githubusercontent.com/lgick/VIMP-Tank-Battle/refs/heads/master/nginx/nginx.conf
sudo ln -sf /etc/nginx/sites-available/$DOMAIN.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# ====== Настройка брандмауэра ======
echo "Настройка UFW..."
echo "y" | sudo ufw enable
sudo ufw allow 'OpenSSH'
sudo ufw allow 'Nginx Full'

# ====== Установка конфигурации Vim ======
echo "Установка конфигурации Vim..."
curl -o ~/.vimrc https://raw.githubusercontent.com/lgick/config/refs/heads/master/.vimrc

echo "Готово! Сервер настроен, проект запущен и SSL установлен."
