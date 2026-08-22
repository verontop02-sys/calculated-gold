#!/usr/bin/env python3
"""Issue Let's Encrypt for api.reaktivo.pro and sb.reaktivo.pro."""
import os
import sys

import paramiko

HOST = os.environ.get("VPS_HOST", "200.165.233.39")
PASSWORD = os.environ.get("VPS_PASSWORD", "")
DOMAINS = ["api.reaktivo.pro", "sb.reaktivo.pro"]


def run(client, cmd, timeout=300):
    print(f"$ {cmd[:160]}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    code = stdout.channel.recv_exit_status()
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    if out.strip():
        print(out.strip()[:4000])
    if err.strip():
        print(err.strip()[:2000])
    print("exit", code)
    return code, out


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if not PASSWORD:
        print("Set VPS_PASSWORD")
        sys.exit(1)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username="root", password=PASSWORD, timeout=30, allow_agent=False, look_for_keys=False)

    for d in DOMAINS:
        run(client, f"getent hosts {d} || true")

    args = " ".join(f"-d {d}" for d in DOMAINS)
    code, _ = run(
        client,
        f"certbot --nginx {args} --non-interactive --agree-tos --register-unsafely-without-email --redirect",
    )
    if code == 0:
        run(client, "curl -sS --max-time 30 https://api.reaktivo.pro/api/health")
        run(client, "curl -sS --max-time 30 https://sb.reaktivo.pro/auth/v1/health")
    client.close()
    sys.exit(code)


if __name__ == "__main__":
    main()
