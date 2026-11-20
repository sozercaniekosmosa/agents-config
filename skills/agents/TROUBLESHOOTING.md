# TROUBLESHOOTING — agents

> Формат: симптом → причина → решение (1 строка на дефект).
> Append-only: только дефекты среды и логики синхронизации, без фич и рефакторинга.

- `sync.cjs pull|push` → `spawnSync cmd.exe EPERM` → ограниченная сессия запрещает анонимные pipe'ы у дочерних процессов → перехват stdout/stderr через временные файлы (`scripts/lib/exec-runner.cjs`).
- `git fetch|ls-remote|push` → `schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS` → schannel недоступен в ограниченной сессии → авторетрай с `-c http.sslBackend=openssl` (openssl + bundled CA bundle).
- `sync.cjs pull` → `Working tree has uncommitted changes` → Quality Gate чистоты дерева перед merge → закоммитить/stash правки `.agents` (pull не удаляет незакоммиченное).
