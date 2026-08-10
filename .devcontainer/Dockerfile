FROM mcr.microsoft.com/devcontainers/python:3.11-bookworm

ENV DEBIAN_FRONTEND=noninteractive

# Installation/Mise à jour de curl, git et autres outils système
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Installation globale de rtk (Rust Token Killer)
RUN curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh

# Installation des dépendances Python au niveau système
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# Installation des dépendances système requises par Playwright
RUN playwright install-deps

# Passage à l'utilisateur non-root vscode pour installer les navigateurs Playwright
USER vscode
RUN playwright install

# Configuration de l'environnement de travail par défaut
WORKDIR /workspace
