# Image de base légère Node.js LTS
FROM node:20-alpine

# Répertoire de travail dans le conteneur
WORKDIR /app

# Copie des fichiers de dépendances en premier (cache Docker optimisé)
COPY package*.json ./

# Installation des dépendances
RUN npm install --omit=dev

# Copie du code source
COPY src/ ./src/

# Exposition du port
EXPOSE 3000

# Démarrage de l'application
CMD ["node", "src/index.js"]