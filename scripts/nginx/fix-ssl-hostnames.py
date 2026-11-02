#!/usr/bin/env python3
"""Развести сертификаты: reaktivo.pro ≠ pro.reaktivo.ru. Запуск на VPS от root."""
from pathlib import Path
import re
import subprocess
import sys

SITES = Path("/etc/nginx/sites-available/reaktivo-sites")
PROXY = Path("/etc/nginx/sites-available/reaktivo-proxy")
LIVE = Path("/etc/letsencrypt/live")


def sh(*args):
    print("+", " ".join(args))
    return subprocess.run(args, check=False)


def must(ok, msg):
    if not ok:
        print("FAIL:", msg)
        sys.exit(1)
    print("OK:", msg)


def main():
    must(SITES.exists(), f"{SITES} exists")
    text = SITES.read_text()
    Path("/root/reaktivo-sites.bak-sslfix").write_text(text)
    print("backup -> /root/reaktivo-sites.bak-sslfix")

    for name in sorted(p.name for p in LIVE.iterdir() if p.is_dir()):
        print("cert:", name)

    has_pro_apex = (LIVE / "reaktivo.pro" / "fullchain.pem").exists()
    has_pro_ru = (LIVE / "pro.reaktivo.ru" / "fullchain.pem").exists()
    must(has_pro_ru, "cert pro.reaktivo.ru present")

    # Убрать pro.reaktivo.ru из server_name блоков reaktivo.pro
    text2 = text
    text2 = re.sub(
        r"(server_name\s+)([^;]*\breaktivo\.pro\b[^;]*);",
        lambda m: m.group(0)
        if "pro.reaktivo.ru" not in m.group(2)
        else "server_name "
        + " ".join(x for x in m.group(2).split() if x != "pro.reaktivo.ru")
        + ";",
        text2,
    )

    # В SSL-блоке reaktivo.pro вернуть правильные пути сертификата
    def fix_pro_ssl_block(src: str) -> str:
        # Ищем 443-блоки с reaktivo.pro и без pro.reaktivo.ru как единственного имени
        parts = re.split(r"(?=server\s*\{)", src)
        out = []
        for part in parts:
            if "listen 443" in part or "listen [::]:443" in part:
                if re.search(r"server_name[^;]*\breaktivo\.pro\b", part) and not re.search(
                    r"server_name[^;]*\bpro\.reaktivo\.ru\b", part
                ):
                    part = re.sub(
                        r"ssl_certificate\s+/etc/letsencrypt/live/[^;]+;",
                        "ssl_certificate /etc/letsencrypt/live/reaktivo.pro/fullchain.pem;",
                        part,
                        count=1,
                    )
                    part = re.sub(
                        r"ssl_certificate_key\s+/etc/letsencrypt/live/[^;]+;",
                        "ssl_certificate_key /etc/letsencrypt/live/reaktivo.pro/privkey.pem;",
                        part,
                        count=1,
                    )
            out.append(part)
        return "".join(out)

    text2 = fix_pro_ssl_block(text2)

    # Отдельный блок для pro.reaktivo.ru, если его ещё нет как самостоятельного server_name
    if not re.search(r"server_name\s+pro\.reaktivo\.ru\s*;", text2):
        # Клонируем SSL-блок reaktivo.pro как шаблон для pro.reaktivo.ru
        m = re.search(
            r"server\s*\{[^{}]*listen 443[^{}]*server_name[^;]*\breaktivo\.pro\b[^;]*;[^{}]*(?:\{[^{}]*\}[^{}]*)*\}",
            text2,
            re.S,
        )
        # Проще: вставим готовый блок перед первым server {
        block = """
server {
    listen 80;
    listen [::]:80;
    server_name pro.reaktivo.ru;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://pro.reaktivo.ru$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name pro.reaktivo.ru;

    ssl_certificate /etc/letsencrypt/live/pro.reaktivo.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pro.reaktivo.ru/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 50m;
    root /var/www/reaktivo-pro;
    index index.html;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location /api/ {
        include snippets/render-proxy.conf;
    }

    location = /sb {
        include snippets/render-proxy.conf;
    }

    location /sb/ {
        include snippets/render-proxy.conf;
    }

    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma "no-cache" always;
        try_files $uri =404;
    }

    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        try_files $uri =404;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}

"""
        text2 = block + text2
        print("inserted dedicated pro.reaktivo.ru server blocks")
    else:
        # Убедиться что у pro.reaktivo.ru правильный cert path
        parts = re.split(r"(?=server\s*\{)", text2)
        out = []
        for part in parts:
            if ("listen 443" in part or "listen [::]:443" in part) and re.search(
                r"server_name\s+pro\.reaktivo\.ru\s*;", part
            ):
                part = re.sub(
                    r"ssl_certificate\s+/etc/letsencrypt/live/[^;]+;",
                    "ssl_certificate /etc/letsencrypt/live/pro.reaktivo.ru/fullchain.pem;",
                    part,
                    count=1,
                )
                part = re.sub(
                    r"ssl_certificate_key\s+/etc/letsencrypt/live/[^;]+;",
                    "ssl_certificate_key /etc/letsencrypt/live/pro.reaktivo.ru/privkey.pem;",
                    part,
                    count=1,
                )
            out.append(part)
        text2 = "".join(out)

    SITES.write_text(text2)
    print("wrote", SITES)

    # api.reaktivo.ru должен остаться на своём cert в proxy
    if PROXY.exists():
        ptxt = PROXY.read_text()
        if "api.reaktivo.ru" in ptxt and "pro.reaktivo.ru/fullchain" in ptxt:
            # cert shared between api+pro is OK for api host; leave proxy alone
            print("proxy: shared pro.reaktivo.ru cert is fine for api.reaktivo.ru")

    r = sh("nginx", "-t")
    must(r.returncode == 0, "nginx -t")
    sh("systemctl", "reload", "nginx")

    if not has_pro_apex:
        print("reaktivo.pro cert missing — issuing")
        r = sh(
            "certbot",
            "--nginx",
            "-d",
            "reaktivo.pro",
            "-d",
            "www.reaktivo.pro",
            "--non-interactive",
            "--agree-tos",
            "--register-unsafely-without-email",
        )
        must(r.returncode == 0, "certbot reaktivo.pro")
    else:
        # Переустановить пути на всякий случай: certbot install
        r = sh(
            "certbot",
            "install",
            "--cert-name",
            "reaktivo.pro",
            "--nginx",
            "--non-interactive",
        )
        if r.returncode != 0:
            print("certbot install returned", r.returncode, "- forcing paths already set")
        sh("nginx", "-t")
        sh("systemctl", "reload", "nginx")

    # Диагностика
    sh("bash", "-lc", "echo | openssl s_client -servername reaktivo.pro -connect 127.0.0.1:443 2>/dev/null | openssl x509 -noout -subject -ext subjectAltName")
    sh("bash", "-lc", "echo | openssl s_client -servername pro.reaktivo.ru -connect 127.0.0.1:443 2>/dev/null | openssl x509 -noout -subject -ext subjectAltName")
    print("DONE")


if __name__ == "__main__":
    main()
