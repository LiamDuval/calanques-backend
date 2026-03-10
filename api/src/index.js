const express = require("express");
const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// ─── Pool de connexions MySQL ─────────────────────────────────────
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 3306,
  database: process.env.DB_NAME || "calanques",
  user: process.env.DB_USER || "calanques_user",
  password: process.env.DB_PASSWORD || "calanques_pass",
  waitForConnections: true,
  connectionLimit: 10,
});

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

// ─── Middleware d'authentification JWT ───────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers["authorization"];
  if (!header) return res.status(401).json({ error: "Token manquant" });

  const token = header.split(" ")[1]; // Format : "Bearer <token>"
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Token invalide ou expiré" });
  }
}

// ════════════════════════════════════════════════════════════════
// ROUTES PUBLIQUES
// ════════════════════════════════════════════════════════════════

// GET /health — vérification de vie (utile pour Android avant tout appel)
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// POST /auth/login — connexion et obtention du JWT
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email et mot de passe requis" });

  try {
    const [rows] = await pool.query(
      "SELECT u.*, r.libelle AS role FROM utilisateurs u JOIN roles r ON u.role_id = r.id WHERE u.email = ? AND u.is_active = 1",
      [email]
    );

    if (rows.length === 0)
      return res.status(401).json({ error: "Identifiants invalides" });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(401).json({ error: "Identifiants invalides" });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /activites — liste de toutes les activités avec leur type
app.get("/activites", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT a.id, a.nom, a.description, a.tarif, a.duree, a.image_url,
             t.libelle AS type, t.image_url AS type_image
      FROM activites a
      JOIN types_activites t ON a.type_id = t.id
      ORDER BY t.libelle, a.nom
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /activites/:id — détail d'une activité + quota
app.get("/activites/:id", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.*, t.libelle AS type, q.quota_jour, q.quota_heure
       FROM activites a
       JOIN types_activites t ON a.type_id = t.id
       LEFT JOIN quotas q ON q.activite_id = a.id
       WHERE a.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0)
      return res.status(404).json({ error: "Activité non trouvée" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /types — liste des types d'activités
app.get("/types", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM types_activites");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ════════════════════════════════════════════════════════════════
// ROUTES PROTÉGÉES (JWT requis)
// ════════════════════════════════════════════════════════════════

// GET /reservations/mes — réservations de l'utilisateur connecté
app.get("/reservations/mes", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.id, r.date, r.commentaire,
              s.libelle AS statut,
              ra.activite_id, a.nom AS activite_nom, a.tarif,
              ra.date_activite, ra.heure_activite, ra.nb_participants
       FROM reservations r
       JOIN statuts_reservations s ON r.statut_reservation_id = s.id
       JOIN reservations_activites ra ON ra.reservation_id = r.id
       JOIN activites a ON a.id = ra.activite_id
       WHERE r.utilisateur_id = ?
       ORDER BY r.date DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /reservations — créer une réservation
app.post("/reservations", authMiddleware, async (req, res) => {
  const { date, commentaire, activites } = req.body;
  // activites = [{ activite_id, date_activite, heure_activite, nb_participants }]

  if (!date || !activites?.length)
    return res.status(400).json({ error: "Données incomplètes" });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      "INSERT INTO reservations (utilisateur_id, date, statut_reservation_id, commentaire) VALUES (?, ?, 1, ?)",
      [req.user.id, date, commentaire || null]
    );
    const reservationId = result.insertId;

    for (const act of activites) {
      await conn.query(
        "INSERT INTO reservations_activites (reservation_id, activite_id, date_activite, heure_activite, nb_participants) VALUES (?, ?, ?, ?, ?)",
        [reservationId, act.activite_id, act.date_activite, act.heure_activite, act.nb_participants]
      );
    }

    await conn.commit();
    res.status(201).json({ id: reservationId, message: "Réservation créée" });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: "Erreur lors de la création" });
  } finally {
    conn.release();
  }
});

// GET /profil — profil de l'utilisateur connecté
app.get("/profil", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, email, nom, prenom, adresse, cp, ville, telephone FROM utilisateurs WHERE id = ?",
      [req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Démarrage ───────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ API Calanques démarrée sur le port ${PORT}`);
});