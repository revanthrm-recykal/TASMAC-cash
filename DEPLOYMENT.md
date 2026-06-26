# Deployment Guide

Target: AWS EC2 — Amazon Linux 2023, ARM64 (aarch64)

## Prerequisites (one-time setup on EC2)

### 1. Install Docker & Docker Compose

```bash
sudo dnf install -y docker
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker ec2-user
newgrp docker   # or log out and back in
```

### 2. Clone the repo

```bash
git clone <repo-url> /home/ec2-user/tasmac-cash
cd /home/ec2-user/tasmac-cash
```

### 3. Create the `.env` file

```bash
cp .env.example .env
nano .env
```

Fill in every value:

| Variable | Notes |
|---|---|
| `NEXTAUTH_URL` | `http://<ec2-public-ip>:3000` |
| `NEXTAUTH_SECRET` | Run `openssl rand -base64 32` to generate |
| `ADMIN_PASSWORD` | Plain text password for the admin login |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | From Google Cloud service account JSON |
| `GOOGLE_PRIVATE_KEY` | From service account JSON — keep the `\n` newlines as-is |
| `GOOGLE_SHEET_ID` | The ID from the Google Sheet URL |
| `PAYMENT_DB_HOST` | MySQL host (RDS endpoint or `localhost`) |
| `PAYMENT_DB_PORT` | Default: `3306` |
| `PAYMENT_DB_USER` | MySQL username |
| `PAYMENT_DB_PASSWORD` | MySQL password |
| `PAYMENT_DB_NAME` | MySQL database name |

### 4. Open EC2 Security Group ports

In AWS Console → EC2 → Security Groups → Inbound rules, add:

| Type | Port | Source |
|---|---|---|
| Custom TCP | 3000 | 0.0.0.0/0 |

---

## First Deploy

```bash
chmod +x deploy.sh
./deploy.sh
```

The app will be available at `http://<ec2-public-ip>:3000`.

---

## Re-deploy After Code Changes

```bash
cd /home/ec2-user/tasmac-cash
./deploy.sh
```

This pulls latest code, rebuilds the image, and restarts containers with zero manual steps.

---

## Common Commands

```bash
# View live logs
docker compose logs -f app

# Stop everything
docker compose down

# Restart without rebuilding
docker compose restart

# Check running containers
docker compose ps
```

---

## File Structure

```
tasmac-cash/
├── Dockerfile          # Multi-stage build (deps → build → runner)
├── .dockerignore       # Excludes node_modules, .env, .git from build context
├── docker-compose.yml  # Runs the app container on port 3000
├── deploy.sh           # One-command deploy script
└── .env                # Secrets — never commit this file
```
