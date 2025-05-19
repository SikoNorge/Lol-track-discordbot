# Basis-Image: Eine stabile Node.js Version
FROM node:20-slim

# Arbeitsverzeichnis im Container erstellen und setzen
WORKDIR /usr/src/app

# package.json und package-lock.json (falls vorhanden) kopieren
# Dies nutzt den Docker Build Cache: Abhängigkeiten werden nur neu installiert, wenn sich diese Dateien ändern
COPY package*.json ./

# Abhängigkeiten installieren
RUN npm install --only=production

# Den Rest des App-Codes kopieren
COPY . .

# Befehl, der beim Starten des Containers ausgeführt wird
CMD [ "npm", "start" ]