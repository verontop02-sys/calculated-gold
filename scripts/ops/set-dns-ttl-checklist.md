# TTL DNS 300–600 с (Masterhost)

В DNS-редакторе Masterhost для зоны `reaktivo.ru` выставить TTL **300** (или минимальный доступный ≤600) на записях:

- `@` (A → VPS A)
- `www` (A)
- `pro` (A)
- `api` (A)

Так failover на VPS B из [failover-dns.md](failover-dns.md) сходится за минуты, а не часы.

Reg.ru (`reaktivo.pro`) — по возможности тот же TTL на A `@` / `www` / `api`.
