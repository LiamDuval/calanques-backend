const express = require("express");
const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// ─── Pool MySQL ───────────────────────────────────────────────────
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

// ════════════════════════════════════════════════════════════════
// MIDDLEWARES
// ════════════════════════════════════════════════════════════════

function authMiddleware(req, res, next) {
  const header = req.headers["authorization"];
  if (!header) return res.status(401).json({ error: "Token manquant" });
  const token = header.split(" ")[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Token invalide ou expiré" });
  }
}

function adminMiddleware(req, res, next) {
  if (req.user.role !== "Admin")
    return res.status(403).json({ error: "Accès admin requis" });
  next();
}

// ════════════════════════════════════════════════════════════════
// HEALTH
// ════════════════════════════════════════════════════════════════

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ════════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════════

// POST /api/auth/signup — Inscription
app.post("/api/auth/signup", async (req, res) => {
  const { email, password, nom, prenom, adresse, cp, ville, telephone } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email et mot de passe requis" });
  if (password.length < 6)
    return res.status(400).json({ error: "Mot de passe trop court (min 6 caractères)" });
  try {
    const [existing] = await pool.query(
      "SELECT id FROM utilisateurs WHERE email = ?", [email]
    );
    if (existing.length > 0)
      return res.status(409).json({ error: "Email déjà utilisé" });
    const hashed = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      `INSERT INTO utilisateurs (email, password, nom, prenom, adresse, cp, ville, telephone, role_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [email, hashed, nom || null, prenom || null, adresse || null, cp || null, ville || null, telephone || null]
    );
    res.status(201).json({ id: result.insertId, email, message: "Compte créé" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/auth/login — Connexion
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "Email et mot de passe requis" });
  try {
    const [rows] = await pool.query(
      `SELECT u.*, r.libelle AS role
       FROM utilisateurs u
       JOIN roles r ON u.role_id = r.id
       WHERE u.email = ? AND u.is_active = 1`,
      [username]
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
      access_token: token,
      token_type: "bearer",
      user: {
        id: user.id, nom: user.nom, prenom: user.prenom,
        email: user.email, role: user.role,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ════════════════════════════════════════════════════════════════
// UTILISATEURS
// ════════════════════════════════════════════════════════════════

// GET /api/users/me — Mon profil
app.get("/api/users/me", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, email, nom, prenom, adresse, cp, ville, telephone, role_id, is_active FROM utilisateurs WHERE id = ?",
      [req.user.id]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// PUT /api/users/me — Modifier mon profil
app.put("/api/users/me", authMiddleware, async (req, res) => {
  const { email, nom, prenom, adresse, cp, ville, telephone } = req.body;
  try {
    await pool.query(
      "UPDATE utilisateurs SET email=?, nom=?, prenom=?, adresse=?, cp=?, ville=?, telephone=? WHERE id=?",
      [email, nom, prenom, adresse, cp, ville, telephone, req.user.id]
    );
    res.json({ message: "Profil mis à jour" });
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// PUT /api/users/me/password — Modifier mon mot de passe
app.put("/api/users/me/password", authMiddleware, async (req, res) => {
  const { old_password, new_password } = req.body;
  if (!old_password || !new_password)
    return res.status(400).json({ error: "Anciens et nouveau mot de passe requis" });
  if (new_password.length < 6)
    return res.status(400).json({ error: "Nouveau mot de passe trop court" });
  try {
    const [rows] = await pool.query(
      "SELECT password FROM utilisateurs WHERE id = ?", [req.user.id]
    );
    const valid = await bcrypt.compare(old_password, rows[0].password);
    if (!valid) return res.status(401).json({ error: "Ancien mot de passe incorrect" });
    const hashed = await bcrypt.hash(new_password, 10);
    await pool.query("UPDATE utilisateurs SET password=? WHERE id=?", [hashed, req.user.id]);
    res.json({ message: "Mot de passe mis à jour" });
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// PUT /api/users/me/deactivate — Désactiver mon compte
app.put("/api/users/me/deactivate", authMiddleware, async (req, res) => {
  try {
    await pool.query("UPDATE utilisateurs SET is_active=0 WHERE id=?", [req.user.id]);
    res.json({ message: "Compte désactivé" });
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// POST /api/users — Admin: créer un utilisateur
app.post("/api/users", authMiddleware, adminMiddleware, async (req, res) => {
  const { email, password, nom, prenom, adresse, cp, ville, telephone, role_id } = req.body;
  if (!email || !password || !role_id)
    return res.status(400).json({ error: "Email, mot de passe et rôle requis" });
  try {
    const hashed = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      `INSERT INTO utilisateurs (email, password, nom, prenom, adresse, cp, ville, telephone, role_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [email, hashed, nom, prenom, adresse, cp, ville, telephone, role_id]
    );
    res.status(201).json({ id: result.insertId, email });
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// GET /api/users — Admin: lister les utilisateurs (filtre par rôle)
app.get("/api/users", authMiddleware, adminMiddleware, async (req, res) => {
  const { role_id } = req.query;
  try {
    let query = "SELECT u.id, u.email, u.nom, u.prenom, u.ville, u.telephone, u.is_active, r.libelle AS role FROM utilisateurs u JOIN roles r ON u.role_id = r.id";
    const params = [];
    if (role_id) { query += " WHERE u.role_id = ?"; params.push(role_id); }
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// GET /api/users/:id — Admin: voir un utilisateur
app.get("/api/users/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT u.*, r.libelle AS role FROM utilisateurs u JOIN roles r ON u.role_id = r.id WHERE u.id = ?",
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Utilisateur non trouvé" });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// PUT /api/users/:id/role — Admin: modifier le rôle
app.put("/api/users/:id/role", authMiddleware, adminMiddleware, async (req, res) => {
  const { role_id } = req.body;
  try {
    await pool.query("UPDATE utilisateurs SET role_id=? WHERE id=?", [role_id, req.params.id]);
    res.json({ message: "Rôle mis à jour" });
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// PUT /api/users/:id/activate — Admin: activer/désactiver
app.put("/api/users/:id/activate", authMiddleware, adminMiddleware, async (req, res) => {
  const { is_active } = req.body;
  try {
    await pool.query("UPDATE utilisateurs SET is_active=? WHERE id=?", [is_active ? 1 : 0, req.params.id]);
    res.json({ message: `Compte ${is_active ? "activé" : "désactivé"}` });
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// ════════════════════════════════════════════════════════════════
// RÔLES
// ════════════════════════════════════════════════════════════════

// GET /api/roles
app.get("/api/roles", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM roles");
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// GET /api/roles/:id
app.get("/api/roles/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM roles WHERE id = ?", [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Rôle non trouvé" });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// POST /api/roles
app.post("/api/roles", authMiddleware, adminMiddleware, async (req, res) => {
  const { libelle } = req.body;
  try {
    const [result] = await pool.query("INSERT INTO roles (libelle) VALUES (?)", [libelle]);
    res.status(201).json({ id: result.insertId, libelle });
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// PUT /api/roles/:id
app.put("/api/roles/:id", authMiddleware, adminMiddleware, async (req, res) => {
  const { libelle } = req.body;
  try {
    await pool.query("UPDATE roles SET libelle=? WHERE id=?", [libelle, req.params.id]);
    res.json({ message: "Rôle mis à jour" });
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// ════════════════════════════════════════════════════════════════
// STATUTS DE RÉSERVATION
// ════════════════════════════════════════════════════════════════

// GET /api/reservation-statuses
app.get("/api/reservation-statuses", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM statuts_reservations");
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// POST /api/reservation-statuses
app.post("/api/reservation-statuses", authMiddleware, adminMiddleware, async (req, res) => {
  const { libelle } = req.body;
  try {
    const [result] = await pool.query("INSERT INTO statuts_reservations (libelle) VALUES (?)", [libelle]);
    res.status(201).json({ id: result.insertId, libelle });
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// PUT /api/reservation-statuses/:id
app.put("/api/reservation-statuses/:id", authMiddleware, adminMiddleware, async (req, res) => {
  const { libelle } = req.body;
  try {
    await pool.query("UPDATE statuts_reservations SET libelle=? WHERE id=?", [libelle, req.params.id]);
    res.json({ message: "Statut mis à jour" });
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// ════════════════════════════════════════════════════════════════
// TYPES D'ACTIVITÉS
// ════════════════════════════════════════════════════════════════

// GET /api/activity-types — Public
app.get("/api/activity-types", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM types_activites ORDER BY libelle ASC");
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// POST /api/activity-types — Admin
app.post("/api/activity-types", authMiddleware, adminMiddleware, async (req, res) => {
  const { libelle, image_url } = req.body;
  try {
    const [result] = await pool.query(
      "INSERT INTO types_activites (libelle, image_url) VALUES (?, ?)", [libelle, image_url || null]
    );
    res.status(201).json({ id: result.insertId, libelle, image_url });
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// PUT /api/activity-types/:id — Admin
app.put("/api/activity-types/:id", authMiddleware, adminMiddleware, async (req, res) => {
  const { libelle, image_url } = req.body;
  try {
    await pool.query(
      "UPDATE types_activites SET libelle=?, image_url=? WHERE id=?",
      [libelle, image_url, req.params.id]
    );
    res.json({ message: "Type mis à jour" });
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// ════════════════════════════════════════════════════════════════
// ACTIVITÉS
// ════════════════════════════════════════════════════════════════

// GET /api/activities — Public (filtres: type, durée, tarif)
app.get("/api/activities", async (req, res) => {
  const { type_id, duree_min, duree_max, tarif_min, tarif_max } = req.query;
  try {
    let query = `
      SELECT a.*, t.libelle AS type_libelle, t.image_url AS type_image_url,
             q.quota_jour, q.quota_heure
      FROM activites a
      JOIN types_activites t ON a.type_id = t.id
      LEFT JOIN quotas q ON q.activite_id = a.id
      WHERE 1=1
    `;
    const params = [];
    if (type_id) { query += " AND a.type_id = ?"; params.push(type_id); }
    if (tarif_min) { query += " AND a.tarif >= ?"; params.push(tarif_min); }
    if (tarif_max) { query += " AND a.tarif <= ?"; params.push(tarif_max); }
    query += " ORDER BY a.nom ASC";
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// GET /api/activities/:id — Public
app.get("/api/activities/:id", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT a.*, t.libelle AS type_libelle, t.image_url AS type_image_url,
             q.quota_jour, q.quota_heure
      FROM activites a
      JOIN types_activites t ON a.type_id = t.id
      LEFT JOIN quotas q ON q.activite_id = a.id
      WHERE a.id = ?
    `, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Activité non trouvée" });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// GET /api/activities/:id/availability — Public
app.get("/api/activities/:id/availability", async (req, res) => {
  const { date, heure } = req.query;
  if (!date) return res.status(400).json({ error: "Paramètre date requis (?date=YYYY-MM-DD)" });
  try {
    const [quotaRows] = await pool.query(
      "SELECT quota_jour, quota_heure FROM quotas WHERE activite_id = ?", [req.params.id]
    );
    if (quotaRows.length === 0)
      return res.status(404).json({ error: "Quota non trouvé pour cette activité" });
    const quota = quotaRows[0];

    const [jourRows] = await pool.query(`
      SELECT COALESCE(SUM(ra.nb_participants), 0) AS reserve_jour
      FROM reservations_activites ra
      JOIN reservations r ON r.id = ra.reservation_id
      WHERE ra.activite_id = ? AND ra.date_activite = ? AND r.statut_reservation_id = 1
    `, [req.params.id, date]);

    let reserveHeure = null;
    if (heure) {
      const [heureRows] = await pool.query(`
        SELECT COALESCE(SUM(ra.nb_participants), 0) AS reserve_heure
        FROM reservations_activites ra
        JOIN reservations r ON r.id = ra.reservation_id
        WHERE ra.activite_id = ? AND ra.date_activite = ? AND ra.heure_activite = ?
        AND r.statut_reservation_id = 1
      `, [req.params.id, date, heure]);
      reserveHeure = heureRows[0].reserve_heure;
    }

    const reserveJour = jourRows[0].reserve_jour;
    res.json({
      activite_id: parseInt(req.params.id),
      date,
      heure: heure || null,
      quota_jour: quota.quota_jour,
      quota_heure: quota.quota_heure,
      reserve_jour: reserveJour,
      reserve_heure: reserveHeure,
      disponible_jour: quota.quota_jour - reserveJour,
      disponible_heure: heure ? quota.quota_heure - reserveHeure : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/activities — Admin
app.post("/api/activities", authMiddleware, adminMiddleware, async (req, res) => {
  const { nom, description, tarif, duree, type_id, image_url } = req.body;
  if (!nom || !duree || !type_id)
    return res.status(400).json({ error: "nom, duree et type_id requis" });
  try {
    const [result] = await pool.query(
      "INSERT INTO activites (nom, description, tarif, duree, type_id, image_url) VALUES (?, ?, ?, ?, ?, ?)",
      [nom, description || null, tarif || null, duree, type_id, image_url || null]
    );
    res.status(201).json({ id: result.insertId, nom });
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// PUT /api/activities/:id — Admin
app.put("/api/activities/:id", authMiddleware, adminMiddleware, async (req, res) => {
  const { nom, description, tarif, duree, type_id, image_url } = req.body;
  try {
    await pool.query(
      "UPDATE activites SET nom=?, description=?, tarif=?, duree=?, type_id=?, image_url=? WHERE id=?",
      [nom, description, tarif, duree, type_id, image_url, req.params.id]
    );
    res.json({ message: "Activité mise à jour" });
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// ════════════════════════════════════════════════════════════════
// QUOTAS
// ════════════════════════════════════════════════════════════════

// GET /api/quotas — Admin
app.get("/api/quotas", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT q.*, a.nom AS activite_nom
      FROM quotas q JOIN activites a ON a.id = q.activite_id
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// GET /api/quotas/:id — Admin
app.get("/api/quotas/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM quotas WHERE id = ?", [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Quota non trouvé" });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// POST /api/quotas — Admin
app.post("/api/quotas", authMiddleware, adminMiddleware, async (req, res) => {
  const { activite_id, quota_jour, quota_heure } = req.body;
  try {
    const [result] = await pool.query(
      "INSERT INTO quotas (activite_id, quota_jour, quota_heure) VALUES (?, ?, ?)",
      [activite_id, quota_jour, quota_heure]
    );
    res.status(201).json({ id: result.insertId, activite_id, quota_jour, quota_heure });
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// PUT /api/quotas/:id — Admin
app.put("/api/quotas/:id", authMiddleware, adminMiddleware, async (req, res) => {
  const { activite_id, quota_jour, quota_heure } = req.body;
  try {
    await pool.query(
      "UPDATE quotas SET activite_id=?, quota_jour=?, quota_heure=? WHERE id=?",
      [activite_id, quota_jour, quota_heure, req.params.id]
    );
    res.json({ message: "Quota mis à jour" });
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// ════════════════════════════════════════════════════════════════
// RÉSERVATIONS
// ════════════════════════════════════════════════════════════════

// POST /api/reservations — Client
app.post("/api/reservations", authMiddleware, async (req, res) => {
  const { date, commentaire, activites } = req.body;
  if (!date || !activites?.length)
    return res.status(400).json({ error: "date et activites requis" });
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
        [reservationId, act.activite_id, act.date_activite, act.heure_activite || null, act.nb_participants]
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

// GET /api/reservations/my — Client
app.get("/api/reservations/my", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT r.id, r.date, r.commentaire, s.libelle AS statut,
             ra.activite_id, a.nom AS activite_nom, a.tarif,
             ra.date_activite, ra.heure_activite, ra.nb_participants
      FROM reservations r
      JOIN statuts_reservations s ON r.statut_reservation_id = s.id
      JOIN reservations_activites ra ON ra.reservation_id = r.id
      JOIN activites a ON a.id = ra.activite_id
      WHERE r.utilisateur_id = ?
      ORDER BY r.date DESC
    `, [req.user.id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// GET /api/reservations — Admin uniquement
app.get("/api/reservations", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT r.*, s.libelle AS statut, u.nom, u.prenom, u.email
      FROM reservations r
      JOIN statuts_reservations s ON r.statut_reservation_id = s.id
      JOIN utilisateurs u ON u.id = r.utilisateur_id
      ORDER BY r.date DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// GET /api/reservations/:id — Client (la sienne) / Admin (n'importe)
app.get("/api/reservations/:id", authMiddleware, async (req, res) => {
  try {
    const whereClause = req.user.role === "Admin"
      ? "WHERE r.id = ?"
      : "WHERE r.id = ? AND r.utilisateur_id = ?";
    const params = req.user.role === "Admin"
      ? [req.params.id]
      : [req.params.id, req.user.id];
    const [rows] = await pool.query(`
      SELECT r.*, s.libelle AS statut,
             ra.activite_id, a.nom AS activite_nom, a.tarif,
             ra.date_activite, ra.heure_activite, ra.nb_participants
      FROM reservations r
      JOIN statuts_reservations s ON r.statut_reservation_id = s.id
      LEFT JOIN reservations_activites ra ON ra.reservation_id = r.id
      LEFT JOIN activites a ON a.id = ra.activite_id
      ${whereClause}
    `, params);
    if (rows.length === 0) return res.status(404).json({ error: "Réservation non trouvée" });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// PUT /api/reservations/:id — Client (modifier sa réservation)
app.put("/api/reservations/:id", authMiddleware, async (req, res) => {
  const { date, commentaire } = req.body;
  try {
    const [check] = await pool.query(
      "SELECT id FROM reservations WHERE id=? AND utilisateur_id=?",
      [req.params.id, req.user.id]
    );
    if (check.length === 0) return res.status(404).json({ error: "Réservation non trouvée" });
    await pool.query(
      "UPDATE reservations SET date=?, commentaire=? WHERE id=?",
      [date, commentaire, req.params.id]
    );
    res.json({ message: "Réservation mise à jour" });
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// PUT /api/reservations/:id/status — Client (la sienne) / Admin
app.put("/api/reservations/:id/status", authMiddleware, async (req, res) => {
  const { statut_reservation_id } = req.body;
  if (!statut_reservation_id)
    return res.status(400).json({ error: "statut_reservation_id requis" });
  try {
    const whereClause = req.user.role === "Admin"
      ? "WHERE id = ?"
      : "WHERE id = ? AND utilisateur_id = ?";
    const params = req.user.role === "Admin"
      ? [statut_reservation_id, req.params.id]
      : [statut_reservation_id, req.params.id, req.user.id];
    await pool.query(`UPDATE reservations SET statut_reservation_id=? ${whereClause}`, params);
    res.json({ message: "Statut mis à jour" });
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// GET /api/reservations/:id/activities — Client / Admin
app.get("/api/reservations/:id/activities", authMiddleware, async (req, res) => {
  try {
    const [check] = await pool.query(
      req.user.role === "Admin"
        ? "SELECT id FROM reservations WHERE id=?"
        : "SELECT id FROM reservations WHERE id=? AND utilisateur_id=?",
      req.user.role === "Admin" ? [req.params.id] : [req.params.id, req.user.id]
    );
    if (check.length === 0) return res.status(404).json({ error: "Réservation non trouvée" });
    const [rows] = await pool.query(`
      SELECT ra.*, a.nom AS activite_nom, a.tarif, a.image_url
      FROM reservations_activites ra
      JOIN activites a ON a.id = ra.activite_id
      WHERE ra.reservation_id = ?
    `, [req.params.id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// PUT /api/reservations/:id/activities/:act_id — Client / Admin
app.put("/api/reservations/:id/activities/:act_id", authMiddleware, async (req, res) => {
  const { date_activite, heure_activite, nb_participants } = req.body;
  try {
    const [check] = await pool.query(
      req.user.role === "Admin"
        ? "SELECT id FROM reservations WHERE id=?"
        : "SELECT id FROM reservations WHERE id=? AND utilisateur_id=?",
      req.user.role === "Admin" ? [req.params.id] : [req.params.id, req.user.id]
    );
    if (check.length === 0) return res.status(404).json({ error: "Réservation non trouvée" });
    await pool.query(
      "UPDATE reservations_activites SET date_activite=?, heure_activite=?, nb_participants=? WHERE reservation_id=? AND activite_id=?",
      [date_activite, heure_activite, nb_participants, req.params.id, req.params.act_id]
    );
    res.json({ message: "Activité de réservation mise à jour" });
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// DELETE /api/reservations/:id/activities/:act_id — Client
app.delete("/api/reservations/:id/activities/:act_id", authMiddleware, async (req, res) => {
  try {
    const [check] = await pool.query(
      "SELECT id FROM reservations WHERE id=? AND utilisateur_id=?",
      [req.params.id, req.user.id]
    );
    if (check.length === 0) return res.status(404).json({ error: "Réservation non trouvée" });
    await pool.query(
      "DELETE FROM reservations_activites WHERE reservation_id=? AND activite_id=?",
      [req.params.id, req.params.act_id]
    );
    res.json({ message: "Activité supprimée de la réservation" });
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});

// ─── Démarrage ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ API Calanques démarrée sur le port ${PORT}`);
  console.log(`📋 Routes disponibles :`);
  console.log(`   POST /api/auth/signup`);
  console.log(`   POST /api/auth/login`);
  console.log(`   GET  /api/activity-types`);
  console.log(`   GET  /api/activities`);
  console.log(`   GET  /api/activities/:id`);
  console.log(`   GET  /api/activities/:id/availability?date=YYYY-MM-DD`);
  console.log(`   POST /api/reservations`);
  console.log(`   GET  /api/reservations/my`);
  console.log(`   ... et toutes les routes admin`);
});