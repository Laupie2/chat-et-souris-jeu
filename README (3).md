# Chat et Souris — prototype (étapes 1 à 3)

## Ce qu'il y a déjà
- Position GPS partagée en temps réel entre tous les joueurs connectés (Socket.io).
- Rôles chat/souris à la connexion.
- Filtrage par rôle côté serveur : un chat voit tout le monde, une souris ne voit que les autres souris (jamais les chats).
- Détection de contact : si un chat passe à moins de `DISTANCE_TOUCHE_METRES` (15m par défaut, en haut de `server.js`) d'une souris, un cooldown démarre pour la souris **et** pour le(s) chat(s) responsables.
- Le cooldown (`COOLDOWN_MS`, 15 min par défaut) se termine tout seul, même si personne ne bouge entre-temps.

## Ce qu'il n'y a pas encore
- Les règles de transport (métro/bus/tram), les buffers géographiques, les events de localisation (étapes 4 à 6).

## Lancer en local
```
npm install
npm start
```
Puis ouvrir `http://localhost:3000` dans le navigateur.

## Tester à plusieurs / sur téléphone
La géolocalisation du navigateur (`navigator.geolocation`) exige un contexte sécurisé :
- `http://localhost:3000` fonctionne très bien pour tester seul sur ton ordi (mais deux onglets sur le même PC auront quasi la même position GPS — utile pour vérifier l'affichage, pas les distances).
- Pour tester depuis un vrai téléphone sur le même réseau WiFi : utilise l'adresse IP locale de ton PC à la place de `localhost` (ex. `http://192.168.1.23:3000`), trouvable avec `ipconfig` dans PowerShell (cherche "Adresse IPv4" sous ta connexion WiFi).
- Pour un vrai déploiement hors réseau local, il faudra un hébergement en HTTPS, ou un tunnel temporaire type `ngrok http 3000` pour un test rapide.
