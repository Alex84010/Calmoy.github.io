// server.js
const express = require('express');
const bodyParser = require('body-parser');

// Remplace par le nom exact exporté si différent
const PronoteAPI = require('pronote-api-maintained');

const app = express();
app.use(bodyParser.json());

// UTIL : calcul de la moyenne générale pondérée
function calculerMoyenneGenerale(subjects) {
  // subjects : array { name, average, coefficient }
  let totalCoeff = 0;
  let total = 0;

  subjects.forEach(s => {
    // ignorer les matières sans moyenne
    if (s.average == null || isNaN(s.average)) return;

    const coeff = (s.coefficient != null && !isNaN(s.coefficient)) ? Number(s.coefficient) : 1;
    const avg = Number(s.average);

    total += avg * coeff;
    totalCoeff += coeff;
  });

  if (totalCoeff === 0) return null;
  return total / totalCoeff;
}

// Route POST /moyenne
// Body attendu : { url: "https://monpronote...", username: "...", password: "..." }
// -> renvoie { moyenneGenerale: 13.42, details: [ { name, average, coefficient } ] }
app.post('/moyenne', async (req, res) => {
  const { url, username, password } = req.body;
  if (!url || !username || !password) {
    return res.status(400).json({ error: 'url, username et password nécessaires' });
  }

  try {
    // === INITIALISATION DU CLIENT ===
    // NOTE : l'API réelle peut exporter une classe, une fonction async, ou un objet.
    // Adapte si nécessaire (ex: new PronoteAPI(...), PronoteAPI.login(...), etc).
    const client = new PronoteAPI({ url }); // si la lib requiert d'autres options, les ajouter

    // Si la lib a une méthode login/init
    if (typeof client.login === 'function') {
      await client.login(username, password);
    } else if (typeof client.init === 'function') {
      // Exemple alternatif
      await client.init({ username, password });
    } else {
      // fallback : essayer une factory
      if (typeof PronoteAPI.authenticate === 'function') {
        // PronoteAPI.authenticate(url, username, password) -> client
        await PronoteAPI.authenticate(url, username, password);
      } else {
        throw new Error('Adaptation nécessaire : méthode d\'authentification inconnue pour pronote-api-maintained. Regarde la README du paquet.');
      }
    }

    // Vérifier si le client est bien connecté (chaque lib a son propre champ)
    if (client.loggedIn === false) {
      return res.status(401).json({ error: 'Échec d\'authentification' });
    }

    // === RÉCUPÉRER LES MATIÈRES / MOYENNES ===
    // Selon la lib, cela peut être client.getSubjects(), client.getGrades(), client.currentPeriod.subjects...
    let subjects = [];

    // Tentatives pratiques : adapte selon la lib
    if (typeof client.getSubjects === 'function') {
      const data = await client.getSubjects(); // suppose que retourne { subjects: [...] } ou [...]
      subjects = Array.isArray(data) ? data : (data.subjects || []);
    } else if (client.currentPeriod && Array.isArray(client.currentPeriod.subjects)) {
      subjects = client.currentPeriod.subjects;
    } else if (typeof client.getMarks === 'function') {
      // getMarks peut renvoyer notes ; il faudra transformer pour obtenir moyennes par matière
      const marks = await client.getMarks();
      // transformation à implémenter si nécessaire...
      subjects = marks.subjects || [];
    } else {
      throw new Error('Impossible de lire les matières : adapte le code au SDK pronote que tu utilises.');
    }

    // Normaliser les données : s'assurer que chaque sujet a { name, average, coefficient }
    const normalized = subjects.map(s => {
      // exemples de noms de champs possibles : s.name / s.intitule ; s.average / s.moyenne ; s.coefficient / s.coeff
      return {
        name: s.name || s.intitule || s.libelle || 'Inconnu',
        average: s.average ?? s.moyenne ?? s.moy ?? null,
        coefficient: s.coefficient ?? s.coeff ?? s.coefficientMatiere ?? null
      };
    });

    const moyenneGenerale = calculerMoyenneGenerale(normalized);

    return res.json({
      moyenneGenerale: moyenneGenerale == null ? null : Number(moyenneGenerale.toFixed(2)),
      details: normalized
    });

  } catch (err) {
    console.error('Erreur Pronote:', err);
    return res.status(500).json({ error: 'Erreur interne', message: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
        
