-- Table des rôles
CREATE TABLE IF NOT EXISTS roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    libelle VARCHAR(50) NOT NULL UNIQUE
) ENGINE = InnoDB;

-- Table des utilisateurs
CREATE TABLE IF NOT EXISTS utilisateurs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    nom VARCHAR(100),
    prenom VARCHAR(100),
    adresse VARCHAR(100),
    cp VARCHAR(10),
    ville VARCHAR(100),
    telephone VARCHAR(20),
    role_id INT NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT '1',
    FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE = InnoDB;

CREATE INDEX idx_utilisateurs_role_id ON utilisateurs(role_id);

-- Table des types d'activités
CREATE TABLE IF NOT EXISTS types_activites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    libelle VARCHAR(100) NOT NULL,
    image_url VARCHAR(255) DEFAULT NULL
) ENGINE = InnoDB;

-- Table des activités
CREATE TABLE IF NOT EXISTS activites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nom VARCHAR(150) NOT NULL,
    description TEXT,
    tarif DECIMAL(10,2),
    duree TIME,
    image_url VARCHAR(255) DEFAULT NULL,
    type_id INT NOT NULL,
    FOREIGN KEY (type_id) REFERENCES types_activites(id)
) ENGINE = InnoDB;

CREATE INDEX idx_activites_type_id ON activites(type_id);

-- Table des quotas
CREATE TABLE IF NOT EXISTS quotas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    activite_id INT NOT NULL,
    quota_jour INT NOT NULL,
    quota_heure INT NOT NULL,
    FOREIGN KEY (activite_id) REFERENCES activites(id)
) ENGINE = InnoDB;

CREATE INDEX idx_quotas_activite_id ON quotas(activite_id);

-- Table des statuts de réservation
CREATE TABLE IF NOT EXISTS statuts_reservations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    libelle VARCHAR(50) NOT NULL UNIQUE
) ENGINE = InnoDB;

-- Table des réservations
CREATE TABLE IF NOT EXISTS reservations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    utilisateur_id INT NOT NULL,
    date DATE NOT NULL,
    statut_reservation_id INT NOT NULL,
    commentaire TEXT,
    FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id),
    FOREIGN KEY (statut_reservation_id) REFERENCES statuts_reservations(id)
) ENGINE = InnoDB;

CREATE INDEX idx_reservations_utilisateur_id ON reservations(utilisateur_id);
CREATE INDEX idx_reservations_statut_reservation_id ON reservations(statut_reservation_id);

-- Table des activités réservées
CREATE TABLE IF NOT EXISTS reservations_activites (
    reservation_id INT,
    activite_id INT,
    date_activite DATE,
    heure_activite TIME,
    nb_participants INT NOT NULL,
    PRIMARY KEY (reservation_id, activite_id, date_activite, heure_activite),
    FOREIGN KEY (reservation_id) REFERENCES reservations(id),
    FOREIGN KEY (activite_id) REFERENCES activites(id)
) ENGINE = InnoDB;

CREATE INDEX idx_reservations_activites_activite_id ON reservations_activites(activite_id);

-- Données : rôles
INSERT IGNORE INTO roles (id, libelle) VALUES
(1, 'Client'),
(2, 'Admin');

-- Données : statuts de réservation
INSERT IGNORE INTO statuts_reservations (libelle) VALUES
('confirmée'),
('annulée');

-- Données : types d'activités
INSERT IGNORE INTO types_activites (libelle, image_url) VALUES
('Balade / Randonnée', 'img/types/randonnee.jpg'),
('Plongée', 'img/types/plongee.jpg'),
('Kayak', 'img/types/kayak.jpg'),
('Bateau / Plaisance', 'img/types/bateau.jpg'),
('Escalade', 'img/types/escalade.jpg'),
('VTT', 'img/types/vtt.jpg'),
('Yoga / Méditation', 'img/types/yoga.jpg'),
('Culture / Visite', 'img/types/culture.jpg'),
('Hélicoptère', 'img/types/helico.jpg'),
('Accrobranche', 'img/types/accrobranche.jpg');

-- Données : activités
INSERT IGNORE INTO activites (id, nom, description, tarif, duree, type_id, image_url) VALUES
(1, 'Excursion en bateau', 'Explorez les calanques en bateau', 50.00, '02:00', 4, 'img/activites/excursion_bateau.jpg'),
(2, 'Randonnée Sugiton guidée', 'Découverte à pied avec un guide naturaliste', 18.00, '03:00', 1, 'img/activites/randonnee_sugiton.jpg'),
(3, 'Sortie VTT', 'Tour en VTT dans les calanques', 40.00, '02:30', 6, 'img/activites/sortie_vtt.jpg'),
(4, 'Plongée sous-marine', 'Découverte des fonds marins', 70.00, '02:00', 2, 'img/activites/plongee_sous_marine.jpg'),
(5, 'Kayak guidé', 'Sortie en kayak avec un guide', 35.00, '02:30', 3, 'img/activites/kayak_guide.jpg'),
(6, 'Visite grotte Cosquer', 'Visite encadrée de la grotte préhistorique', 28.00, '01:30', 8, 'img/activites/grotte_cosquer.jpg'),
(7, 'Escalade encadrée', 'Cours ou sortie escalade avec moniteur', 55.00, '03:00', 5, 'img/activites/escalade_encadree.jpg'),
(8, 'Parcours accrobranche', 'Activité ludique en hauteur', 25.00, '01:45', 10, 'img/activites/parcours_accrobranche.jpg'),
(9, 'Séance de yoga', 'Méditation guidée dans la nature', 15.00, '01:00', 7, 'img/activites/seance_yoga.jpg'),
(10, 'Bivouac réglementé', 'Nuit en zone protégée', 12.00, '12:00', 1, 'img/activites/bivouac.jpg'),
(11, 'Vol en hélicoptère', 'Survol des Calanques', 160.00, '00:45', 9, 'img/activites/vol_helicoptere.jpg'),
(12, 'Initiation à la spéléologie', 'Découverte des grottes calcaires avec un guide', 45.00, '02:30', 1, 'img/activites/initiation_speleologie.jpg'),
(13, 'Randonnée Belvédère En Vau', 'Balade guidée pour atteindre un belvédère naturel', 20.00, '02:00', 1, 'img/activites/randonnee_belvedere.jpg'),
(14, 'Sortie kayak sunset', 'Balade en kayak au coucher du soleil', 38.00, '02:00', 3, 'img/activites/kayak_sunset.jpg'),
(15, 'Bain sonore méditatif', 'Relaxation avec bols tibétains dans un cadre naturel', 22.00, '01:15', 7, 'img/activites/bain_sonore.jpg'),
(16, 'Exploration en paddle', 'Visite autonome des calanques en paddle', 30.00, '01:30', 3, 'img/activites/paddle.jpg'),
(17, 'Escalade grande voie', 'Ascension guidée sur plusieurs longueurs', 70.00, '04:00', 5, 'img/activites/escalade_grande_voie.jpg'),
(18, 'Atelier photo nature', 'Apprentissage de la photo dans les calanques', 25.00, '02:30', 8, 'img/activites/atelier_photo.jpg'),
(19, 'Randonnée botanique', 'Balade guidée axée sur la flore locale', 18.00, '02:00', 1, 'img/activites/randonnee_botanique.jpg');

-- Données : quotas
INSERT IGNORE INTO quotas (activite_id, quota_jour, quota_heure) VALUES
(1, 320, 40),
(2, 120, 30),
(3, 90, 15),
(4, 60, 10),
(5, 96, 16),
(6, 200, 40),
(7, 45, 9),
(8, 120, 20),
(9, 80, 20),
(10, 30, 15),
(11, 16, 4),
(12, 40, 8),    
(13, 60, 12),   
(14, 48, 8),    
(15, 30, 6),    
(16, 56, 8),    
(17, 15, 3),    
(18, 40, 8),    
(19, 60, 12);   

-- Données : utilisateurs
INSERT IGNORE INTO utilisateurs (email, password, nom, prenom, adresse, cp, ville, telephone, role_id) VALUES
('alice.dupont@gmail.com', '$argon2id$v=19$m=65536,t=3,p=4$T8m5F4JQ6t3bG0Oo1fofow$HGw1d9a+4DtpcPay1WjeklvsLp8vPXdd3f1XTs3yANc', 'Dupont', 'Alice', '10 rue Paradis', '13001', 'Marseille', '0600000001', 1),
('arnaud.martin@protonmail.com', '$argon2id$v=19$m=65536,t=3,p=4$T8m5F4JQ6t3bG0Oo1fofow$HGw1d9a+4DtpcPay1WjeklvsLp8vPXdd3f1XTs3yANc', 'Martin', 'Arnaud', '5 avenue du Prado', '13080', 'Aix en Provence', '0600000002', 1),
('marie.bonnet@outlook.fr', '$argon2id$v=19$m=65536,t=3,p=4$T8m5F4JQ6t3bG0Oo1fofow$HGw1d9a+4DtpcPay1WjeklvsLp8vPXdd3f1XTs3yANc', 'Bonnet', 'Marie', '18 boulevard Michelet', '69001', 'Lyon', '0600114455', 1),
('sophie.duval@gmail.com', '$argon2id$v=19$m=65536,t=3,p=4$T8m5F4JQ6t3bG0Oo1fofow$HGw1d9a+4DtpcPay1WjeklvsLp8vPXdd3f1XTs3yANc', 'Duval', 'Sophie', '12 rue Sainte', '13002', 'Marseille', '0600000004', 1),
('john.renaud@gmail.com', '$argon2id$v=19$m=65536,t=3,p=4$T8m5F4JQ6t3bG0Oo1fofow$HGw1d9a+4DtpcPay1WjeklvsLp8vPXdd3f1XTs3yANc', 'Renaud', 'john', '8 boulevard Longchamp', '13001', 'Marseille', '0600000005', 1),
('thomas.morel@icloud.com', '$argon2id$v=19$m=65536,t=3,p=4$T8m5F4JQ6t3bG0Oo1fofow$HGw1d9a+4DtpcPay1WjeklvsLp8vPXdd3f1XTs3yANc', 'Morel', 'Thomas', '4 rue Paradis', '13001', 'Marseille', '0600000007', 1),
('emma.lefevre@gmail.com', '$argon2id$v=19$m=65536,t=3,p=4$T8m5F4JQ6t3bG0Oo1fofow$HGw1d9a+4DtpcPay1WjeklvsLp8vPXdd3f1XTs3yANc', 'Lefevre', 'Emma', '7 place Castellane', '13006', 'Marseille', '0600000008', 1),
('luc.durand@gmail.com', '$argon2id$v=19$m=65536,t=3,p=4$T8m5F4JQ6t3bG0Oo1fofow$HGw1d9a+4DtpcPay1WjeklvsLp8vPXdd3f1XTs3yANc', 'Durand', 'Luc', '15 boulevard Chave', '13005', 'Marseille', '0600000009', 1),
('jean.leroy@calanques.fr', '$argon2id$v=19$m=65536,t=3,p=4$T8m5F4JQ6t3bG0Oo1fofow$HGw1d9a+4DtpcPay1WjeklvsLp8vPXdd3f1XTs3yANc', 'Leroy', 'Jean', '2 rue Saint-Ferréol', '13001', 'Marseille', '0600000003', 2),
('anne.bernard@calanques.fr', '$argon2id$v=19$m=65536,t=3,p=4$T8m5F4JQ6t3bG0Oo1fofow$HGw1d9a+4DtpcPay1WjeklvsLp8vPXdd3f1XTs3yANc', 'Bernard', 'Anne', '1 avenue Montolivet', '13010', 'Marseille', '0600000006', 2),
('sophie.durand@calanques.fr', '$argon2id$v=19$m=65536,t=3,p=4$T8m5F4JQ6t3bG0Oo1fofow$HGw1d9a+4DtpcPay1WjeklvsLp8vPXdd3f1XTs3yANc', 'Durand', 'Sophie', '20 avenue du Support', '13000', 'Marseille', '0600000012', 3),
('thomas.martin@calanques.fr', '$argon2id$v=19$m=65536,t=3,p=4$T8m5F4JQ6t3bG0Oo1fofow$HGw1d9a+4DtpcPay1WjeklvsLp8vPXdd3f1XTs3yANc', 'Martin', 'Thomas', '22 avenue du Support', '13000', 'Marseille', '0600000013', 3);

-- Données : réservations
INSERT IGNORE INTO reservations (id, utilisateur_id, date, statut_reservation_id, commentaire) VALUES
(1, 1, '2025-07-10', 1, 'Demande spéciale : besoin d’un guide anglophone.'),
(2, 2, '2025-07-11', 1, NULL),
(3, 3, '2025-07-12', 1, NULL),
(4, 4, '2025-07-15', 1, 'Allergie alimentaire signalée.'),
(5, 5, '2025-07-20', 1, NULL),
(6, 6, '2025-07-22', 2, NULL),
(7, 7, '2025-07-23', 1, 'Préciser point de rendez-vous.'),
(8, 8, '2025-07-25', 1, NULL);

-- Données : activités réservées
INSERT IGNORE INTO reservations_activites (reservation_id, activite_id, date_activite, heure_activite, nb_participants) VALUES
(1, 2, '2025-07-15', '08:00', 2),
(1, 5, '2025-07-15', '11:00', 2),
(2, 1, '2025-07-20', '10:00', 1),
(2, 6, '2025-07-20', '13:00', 1),
(2, 9, '2025-07-21', '06:30', 1),
(3, 4, '2025-07-25', '14:00', 1),
(3, 10, '2025-07-25', '18:00', 1),
(4, 8, '2025-07-16', '09:00', 3),
(5, 7, '2025-07-21', '08:00', 2),
(5, 3, '2025-07-21', '12:00', 2),
(6, 11, '2025-07-22', '15:00', 1),
(7, 2, '2025-07-23', '07:00', 1),
(7, 5, '2025-07-23', '11:00', 1),
(8, 1, '2025-07-25', '09:00', 2);
