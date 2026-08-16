#!/usr/bin/env python3
"""Install Ministry of Digital Development TLS CAs on the RU VPS (nginx → T-Bank)."""
import os
import sys
from pathlib import Path

import paramiko

HOST = os.environ.get("VPS_HOST", "200.165.233.39")
PASSWORD = os.environ.get("VPS_PASSWORD", "")
USER = os.environ.get("VPS_USER", "root")
BUNDLE = Path(__file__).resolve().parents[1] / "server" / "certs" / "russian-trusted-ca-bundle.pem"


def run(client, cmd, timeout=120):
    print("$", cmd)
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if out:
        print(out.rstrip())
    if err:
        print(err.rstrip())
    if code != 0:
        raise SystemExit(f"exit {code}: {cmd}")


def main():
    if not PASSWORD:
        sys.exit("Set VPS_PASSWORD")
    if not BUNDLE.is_file():
        sys.exit(f"missing {BUNDLE}")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    sftp = client.open_sftp()
    sftp.put(str(BUNDLE), "/tmp/russian-trusted-ca-bundle.pem")
    sftp.close()

    run(
        client,
        "awk 'BEGIN{n=0} /BEGIN CERTIFICATE/{n++} n==1{print} /END CERTIFICATE/ && n==1{exit}' "
        "/tmp/russian-trusted-ca-bundle.pem > /usr/local/share/ca-certificates/russian_trusted_root_ca.crt",
    )
    run(
        client,
        "awk 'BEGIN{n=0} /BEGIN CERTIFICATE/{n++} n==2{print}' "
        "/tmp/russian-trusted-ca-bundle.pem > /usr/local/share/ca-certificates/russian_trusted_sub_ca.crt",
    )
    run(client, "update-ca-certificates")
    run(client, "curl -sS -o /dev/null -w 'mddc:%{http_code} ssl:%{ssl_verify_result}\\n' --max-time 20 https://mddc.tbank.ru/ || true")
    run(client, "curl -sS -o /dev/null -w 'securepay:%{http_code} ssl:%{ssl_verify_result}\\n' --max-time 20 https://securepay.tinkoff.ru/v2/Init || true")
    client.close()
    print("OK: Mincifry CAs installed on VPS")


if __name__ == "__main__":
    main()
