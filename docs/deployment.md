# Deployment to chronist.eu

`.github/workflows/deploy.yml` builds the Docker image on every push to `master`
(and on `v*` tags or a manual run), pushes it to `ghcr.io/reigra/m5-chronist`
and deploys it to the VPS over SSH. On the server, Caddy terminates HTTPS for
`www.chronist.eu` (the canonical origin) and proxies to the nginx container.
`chronist.eu` redirects permanently to `www.chronist.eu` (both need A/AAAA
records for the certificates).

```
GitHub Actions ──push──▶ ghcr.io ◀──pull── VPS: caddy :80/:443 ──▶ app (nginx :80)
        └────────── ssh deploy@chronist.eu ──────────┘
```

Image tags: `latest` (master), `sha-<commit>`, `<version>` (tag `v1.2.3`).
The server always runs the exact digest that the workflow built.

## One-time setup

### 1. Server (as root)

```bash
# Deploy user that may run docker (note: docker group = root-equivalent)
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy

# Target directory
install -d -o deploy -g deploy /opt/m5-chronist
```

Open ports 22, 80 and 443 (TCP) and 443 (UDP, optional for HTTP/3) in the
STRATO firewall (server panel) and in `ufw`/`nftables`, if active. Nothing else
may listen on 80/443.

### 2. Deploy key pair (on your machine)

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy@chronist.eu" -N "" -f ~/.ssh/chronist_deploy
```

Install the public key for the deploy user (as root on the server):

```bash
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
echo "ssh-ed25519 AAAA... github-actions-deploy@chronist.eu" >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
```

Optionally restrict the key to forwarding-free use by prefixing the line with
`no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty `.

Test: `ssh -i ~/.ssh/chronist_deploy deploy@chronist.eu docker ps`

### 3. Host key for `known_hosts`

```bash
ssh-keyscan -t ed25519 chronist.eu
```

Compare the fingerprint with the one on the server
(`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`) before storing it.

### 4. GitHub secrets

Create the environment **production** (Settings → Environments) and add:

| Secret               | Value                                         |
|----------------------|-----------------------------------------------|
| `DEPLOY_HOST`        | `chronist.eu`                                 |
| `DEPLOY_USER`        | `deploy`                                      |
| `DEPLOY_SSH_KEY`     | content of `~/.ssh/chronist_deploy` (private) |
| `DEPLOY_KNOWN_HOSTS` | output line(s) of `ssh-keyscan` from step 3   |

With the GitHub CLI:

```bash
gh secret set DEPLOY_HOST        --env production --body chronist.eu
gh secret set DEPLOY_USER        --env production --body deploy
gh secret set DEPLOY_SSH_KEY     --env production < ~/.ssh/chronist_deploy
ssh-keyscan -t ed25519 chronist.eu | gh secret set DEPLOY_KNOWN_HOSTS --env production
```

Optional repository secrets for Google Drive (baked into the client bundle):
`VITE_GOOGLE_API_KEY`, `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_APP_ID`,
`VITE_GOOGLE_CLIENT_SECRET`. Add `https://www.chronist.eu` as an authorized
JavaScript origin of the OAuth client in the Google Cloud console.

After the secrets are stored, delete the private key locally or keep it in a
password manager; it is only needed by GitHub.

## Operations

- Logs: `ssh deploy@chronist.eu 'cd /opt/m5-chronist && docker compose logs -f'`
- Rollback: re-run an older successful workflow run (Actions → run → Re-run
  all jobs). The server holds no registry credentials, so a manual
  `docker compose pull` needs `docker login ghcr.io` with a personal access
  token (`read:packages`) first.
- Rotate the deploy key: generate a new pair, replace the line in
  `authorized_keys` and update `DEPLOY_SSH_KEY`.
