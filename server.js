const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Cooldown après un contact : 10 min si près d'un métro ou dans la première couronne, 15 min sinon.
const COOLDOWN_COURT_MS = 10 * 60 * 1000;
const COOLDOWN_LONG_MS = 15 * 60 * 1000;

// Rayon du buffer autour d'une station de métro, en mètres.
const BUFFER_METRO_METRES = 100;

// Stations de métro bruxellois (source : données ouvertes STIB, portail Belgian Mobility).
// Liste des stations principales des 4 lignes (M1/M2/M5/M6), pas les ~59 au complet.
const STATIONS_METRO = [
  { nom: 'Gare Centrale', lat: 50.8455, lng: 4.3572 },
  { nom: 'De Brouckère', lat: 50.8505, lng: 4.3519 },
  { nom: 'Rogier', lat: 50.8590, lng: 4.3547 },
  { nom: 'Botanique', lat: 50.8579, lng: 4.3654 },
  { nom: 'Madou', lat: 50.8511, lng: 4.3665 },
  { nom: 'Arts-Loi', lat: 50.8459, lng: 4.3676 },
  { nom: 'Trône', lat: 50.8410, lng: 4.3672 },
  { nom: 'Maelbeek', lat: 50.8437, lng: 4.3789 },
  { nom: 'Schuman', lat: 50.8434, lng: 4.3814 },
  { nom: 'Merode', lat: 50.8378, lng: 4.3928 },
  { nom: 'Montgomery', lat: 50.8378, lng: 4.4058 },
  { nom: 'Herrmann-Debroux', lat: 50.8218, lng: 4.4432 },
  { nom: 'Simonis', lat: 50.8664, lng: 4.3364 },
  { nom: 'Gare de l\'Ouest', lat: 50.8508, lng: 4.3268 },
  { nom: 'Beekkant', lat: 50.8611, lng: 4.3283 },
  { nom: 'Comte de Flandre', lat: 50.8535, lng: 4.3384 },
  { nom: 'Étangs Noirs', lat: 50.8563, lng: 4.3336 },
  { nom: 'Sainte-Catherine', lat: 50.8503, lng: 4.3459 },
  { nom: 'Yser', lat: 50.8535, lng: 4.3468 },
  { nom: 'Parc', lat: 50.8471, lng: 4.3617 },
  { nom: 'Louise', lat: 50.8378, lng: 4.3565 },
  { nom: 'Hôtel des Monnaies', lat: 50.8340, lng: 4.3441 },
  { nom: 'Porte de Hal', lat: 50.8338, lng: 4.3468 },
  { nom: 'Gare du Midi', lat: 50.8357, lng: 4.3358 },
  { nom: 'Clemenceau', lat: 50.8317, lng: 4.3286 },
  { nom: 'Delacroix', lat: 50.8280, lng: 4.3247 },
  { nom: 'Erasme', lat: 50.8168, lng: 4.2778 },
  { nom: 'CERIA', lat: 50.8090, lng: 4.2925 },
  { nom: 'Eddy Merckx', lat: 50.8188, lng: 4.2998 },
  { nom: 'Saint-Guidon', lat: 50.8306, lng: 4.3117 },
  { nom: 'Roi Baudouin', lat: 50.8814, lng: 4.3358 },
  { nom: 'Belgica', lat: 50.8724, lng: 4.3306 },
  { nom: 'Elisabeth', lat: 50.8622, lng: 4.3287 },
  { nom: 'Osseghem', lat: 50.8619, lng: 4.3181 },
  { nom: 'Stockel', lat: 50.8398, lng: 4.4649 },
  { nom: 'Alma', lat: 50.8622, lng: 4.4166 },
];

// Contour de la première couronne (fourni par toi, converti depuis EPSG:3857 vers WGS84).
const CONTOUR_PREMIERE_COURONNE = [
  { lat: 50.858496, lng: 4.34643 },
  { lat: 50.852255, lng: 4.368537 },
  { lat: 50.847603, lng: 4.369616 },
  { lat: 50.840566, lng: 4.365482 },
  { lat: 50.834437, lng: 4.352181 },
  { lat: 50.833245, lng: 4.347958 },
  { lat: 50.833529, lng: 4.343734 },
  { lat: 50.833642, lng: 4.342835 },
  { lat: 50.848794, lng: 4.337533 },
  { lat: 50.858496, lng: 4.34643 },
];
function estDansPremiereCouronne(lat, lng) {
  if (CONTOUR_PREMIERE_COURONNE.length < 3) return false;
  // Test point-dans-polygone (ray casting).
  let dedans = false;
  for (let i = 0, j = CONTOUR_PREMIERE_COURONNE.length - 1; i < CONTOUR_PREMIERE_COURONNE.length; j = i++) {
    const pi = CONTOUR_PREMIERE_COURONNE[i], pj = CONTOUR_PREMIERE_COURONNE[j];
    const intersecte = (pi.lng > lng) !== (pj.lng > lng) &&
      lat < ((pj.lat - pi.lat) * (lng - pi.lng)) / (pj.lng - pi.lng) + pi.lat;
    if (intersecte) dedans = !dedans;
  }
  return dedans;
}

const joueurs = {}; // socket.id -> { id, blase, role, lat, lng, statut, finCooldown, swapRoleApresCooldown }

function distanceMetres(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estPresDuMetro(lat, lng) {
  if (lat == null || lng == null) return false;
  return STATIONS_METRO.some((s) => distanceMetres(lat, lng, s.lat, s.lng) <= BUFFER_METRO_METRES);
}

// 10 min dans une "zone tampon" (près d'un métro ou première couronne), 15 min sinon.
function dureeCooldown(lat, lng) {
  if (estPresDuMetro(lat, lng) || estDansPremiereCouronne(lat, lng)) return COOLDOWN_COURT_MS;
  return COOLDOWN_LONG_MS;
}

function purgerCooldownExpire(joueur) {
  if (joueur.finCooldown && Date.now() >= joueur.finCooldown) {
    joueur.statut = 'en jeu';
    joueur.finCooldown = null;
    if (joueur.nouveauRoleApresCooldown) {
      joueur.role = joueur.nouveauRoleApresCooldown;
      joueur.nouveauRoleApresCooldown = null;
    }
  }
}

function texteStatut(joueur) {
  if (joueur.statut === 'cooldown' && joueur.finCooldown) {
    const minutesRestantes = Math.max(1, Math.ceil((joueur.finCooldown - Date.now()) / 60000));
    return `cooldown (${minutesRestantes} min restantes)`;
  }
  return joueur.statut;
}

// Les chats voient tout le monde, les souris ne voient que les souris.
// Un joueur en cooldown est invisible pour tout le monde SAUF pour lui-même.
function joueursVisiblesPour(monId, monRole) {
  return Object.values(joueurs)
    .filter((j) => j.id === monId || j.statut !== 'cooldown')
    .filter((j) => monRole === 'chat' || j.role === 'souris')
    .map((j) => ({ id: j.id, blase: j.blase, role: j.role, lat: j.lat, lng: j.lng }));
}

function diffuserCarte() {
  Object.values(joueurs).forEach(purgerCooldownExpire);
  for (const [id, socket] of io.sockets.sockets) {
    const moi = joueurs[id];
    if (!moi) continue;
    socket.emit('maj_carte', {
      monStatut: texteStatut(moi),
      monRole: moi.role,
      presDuMetro: estPresDuMetro(moi.lat, moi.lng),
      joueurs: joueursVisiblesPour(moi.id, moi.role),
    });
  }
}

io.on('connection', (socket) => {
  socket.on('rejoindre_jeu', ({ blase, role }) => {
    joueurs[socket.id] = {
      id: socket.id,
      blase,
      role,
      lat: null,
      lng: null,
      statut: 'en jeu',
      finCooldown: null,
      nouveauRoleApresCooldown: null,
    };
    diffuserCarte();
  });

  socket.on('mise_a_jour_position', ({ lat, lng }) => {
    const joueur = joueurs[socket.id];
    if (!joueur) return;
    joueur.lat = lat;
    joueur.lng = lng;
    diffuserCarte();
  });

  // Chaque joueur signale lui-même son propre contact (souris touchée, ou chat qui vient
  // d'attraper quelqu'un). Le clic n'affecte QUE la personne qui clique - pour un échange
  // complet, il faut que les deux personnes impliquées cliquent chacune leur bouton.
  socket.on('signaler_contact', () => {
    const moi = joueurs[socket.id];
    if (!moi || moi.statut === 'cooldown' || moi.lat == null) return;

    const duree = dureeCooldown(moi.lat, moi.lng);
    moi.statut = 'cooldown';
    moi.finCooldown = Date.now() + duree;
    moi.nouveauRoleApresCooldown = moi.role === 'souris' ? 'chat' : 'souris';

    diffuserCarte();
  });

  socket.on('disconnect', () => {
    delete joueurs[socket.id];
    diffuserCarte();
  });
});

setInterval(diffuserCarte, 10000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Serveur lancé sur le port ${PORT}`));
