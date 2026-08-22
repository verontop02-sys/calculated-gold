#!/usr/bin/env python3
"""Add emergency sslip.io hostnames (bypass broken ISP NXDOMAIN cache)."""
import os
import sys

import paramiko

HOST = os.environ.get("VPS_HOST", "200.165.233.39")
PASSWORD = os.environ.get("VPS_PASSWORD", "")
API_ALT = "api.200-165-233-39.sslip.io"
SB_ALT = "sb.200-165-233-39.sslip.io"
RENDER = "https://calculated-gold.onrender.com"
SUPABASE = "https://csfrsctvrhltthwocspo.supabase.co"
SB_HOST = "csfrsctvrhltthwocspo.supabase.co"

API_CONF = f"""
server {{
    listen 80;
    listen [::]:80;
    server_name {API_ALT};

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
    server_name {SB_ALT};

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
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_buffering off;
    }}
}}
""".strip()


def run(client, cmd, timeout=300):
    print(f"$ {cmd[:160]}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    code = stdout.channel.recv_exit_status()
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    if out.strip():
        print(out.strip()[:3000])
    if err.strip():
        print(err.strip()[:2000])
    print("exit", code)
    return code


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if not PASSWORD:
        sys.exit("Set VPS_PASSWORD")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username="root", password=PASSWORD, timeout=30, allow_agent=False, look_for_keys=False)

    sftp = client.open_sftp()
    with sftp.file("/etc/nginx/sites-available/api-sslip", "w") as f:
        f.write(API_CONF + "\n")
    with sftp.file("/etc/nginx/sites-available/sb-sslip", "w") as f:
        f.write(SB_CONF + "\n")
    sftp.close()

    run(client, "ln -sfn /etc/nginx/sites-available/api-sslip /etc/nginx/sites-enabled/api-sslip")
    run(client, "ln -sfn /etc/nginx/sites-available/sb-sslip /etc/nginx/sites-enabled/sb-sslip")
    run(client, "nginx -t && systemctl reload nginx")
    run(
        client,
        f"certbot --nginx -d {API_ALT} -d {SB_ALT} --non-interactive --agree-tos --register-unsafely-without-email --redirect",
    )
    run(client, f"curl -sS --max-time 30 https://{API_ALT}/api/health")
    client.close()


if __name__ == "__main__":
    main()
