#!/usr/bin/env python3
"""Configure nginx: api.reaktivo.pro → Render, sb.reaktivo.pro → Supabase."""
import os
import sys

import paramiko

HOST = os.environ.get("VPS_HOST", "200.165.233.39")
PASSWORD = os.environ.get("VPS_PASSWORD", "")
API_DOMAIN = "api.reaktivo.pro"
SB_DOMAIN = "sb.reaktivo.pro"
RENDER = "https://calculated-gold.onrender.com"
SUPABASE = "https://csfrsctvrhltthwocspo.supabase.co"
SB_HOST = "csfrsctvrhltthwocspo.supabase.co"

API_CONF = f"""
server {{
    listen 80;
    listen [::]:80;
    server_name {API_DOMAIN};

    client_max_body_size 50m;

    location /.well-known/acme-challenge/ {{
        root /var/www/html;
    }}

    location / {{
        proxy_pass {RENDER};
        proxy_http_version 1.1;
        proxy_set_header Host calculated-gold.onrender.com;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header Connection "";
        proxy_ssl_server_name on;
        proxy_ssl_name calculated-gold.onrender.com;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_connect_timeout 60s;
        proxy_buffering off;
        proxy_cache off;
    }}
}}
""".strip()

SB_CONF = f"""
server {{
    listen 80;
    listen [::]:80;
    server_name {SB_DOMAIN};

    client_max_body_size 50m;

    location /.well-known/acme-challenge/ {{
        root /var/www/html;
    }}

    location / {{
        proxy_pass {SUPABASE};
        proxy_http_version 1.1;
        proxy_set_header Host {SB_HOST};
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_ssl_server_name on;
        proxy_ssl_name {SB_HOST};
        # Auth / Realtime websockets
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_buffering off;
    }}
}}
""".strip()

MAP_CONF = """
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}
""".strip()


def run(client, cmd, timeout=300):
    print(f"$ {cmd[:140]}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    code = stdout.channel.recv_exit_status()
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    if out.strip():
        print(out.strip()[:3000])
    if err.strip() and code != 0:
        print("ERR:", err.strip()[:1500])
    print("exit", code)
    return code


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if not PASSWORD:
        print("Set VPS_PASSWORD")
        sys.exit(1)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username="root", password=PASSWORD, timeout=30, allow_agent=False, look_for_keys=False)

    sftp = client.open_sftp()
    with sftp.file("/etc/nginx/conf.d/00-websocket-map.conf", "w") as f:
        f.write(MAP_CONF + "\n")
    with sftp.file("/etc/nginx/sites-available/api-reaktivo", "w") as f:
        f.write(API_CONF + "\n")
    with sftp.file("/etc/nginx/sites-available/sb-reaktivo", "w") as f:
        f.write(SB_CONF + "\n")
    sftp.close()

    run(client, "ln -sfn /etc/nginx/sites-available/api-reaktivo /etc/nginx/sites-enabled/api-reaktivo")
    run(client, "ln -sfn /etc/nginx/sites-available/sb-reaktivo /etc/nginx/sites-enabled/sb-reaktivo")
    run(client, "nginx -t && systemctl reload nginx")
    run(client, f"curl -sS --max-time 30 -H 'Host: {API_DOMAIN}' http://127.0.0.1/api/health")
    run(client, f"curl -sS --max-time 30 -H 'Host: {SB_DOMAIN}' http://127.0.0.1/auth/v1/health")
    client.close()
    print("OK: both vhosts ready (HTTP). Add DNS A for api + sb, then certbot.")


if __name__ == "__main__":
    main()
