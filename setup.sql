-- PMO Control Center - MySQL Setup
CREATE DATABASE IF NOT EXISTS pmo_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE pmo_db;

CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  role VARCHAR(20) DEFAULT 'member',
  product VARCHAR(200),
  email VARCHAR(200),
  pos VARCHAR(100),
  password VARCHAR(200) NOT NULL,
  access TEXT,
  added DATE DEFAULT (CURDATE()),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id INT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  stage VARCHAR(50) DEFAULT 'Initiation',
  status VARCHAR(30) DEFAULT 'on_track',
  owner VARCHAR(100),
  ownerColor VARCHAR(20),
  northStar VARCHAR(500),
  budgetPlan DECIMAL(15,2) DEFAULT 0,
  budgetFact DECIMAL(15,2) DEFAULT 0,
  deadline DATE,
  progress INT DEFAULT 0,
  yearlyGoal TEXT,
  kpis JSON,
  issues JSON,
  monthlyPlan JSON,
  description TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
  id INT PRIMARY KEY,
  projectId INT,
  title VARCHAR(300) NOT NULL,
  owner VARCHAR(100),
  deadline DATE,
  status VARCHAR(30) DEFAULT 'todo',
  priority VARCHAR(20) DEFAULT 'medium',
  sprint VARCHAR(100),
  goal TEXT,
  progress INT,
  kpis JSON,
  issues JSON,
  description TEXT,
  reqId INT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS collab_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fromUserId INT,
  toUserId INT,
  title VARCHAR(300) NOT NULL,
  description TEXT,
  priority VARCHAR(20) DEFAULT 'medium',
  deadline DATE,
  projectId INT,
  status VARCHAR(30) DEFAULT 'pending',
  taskId INT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  role VARCHAR(10) NOT NULL,
  content TEXT NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (userId)
);

SELECT 'Database ready!' AS status;
