-- Drop the database if it exists (be careful with this in production!)
CREATE DATABASE IF NOT EXISTS rt_rw_db;
USE rt_rw_db;

-- Create the users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'warga') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Note: The passwords here are hashed using bcrypt.
-- Hash for 'password123' is '$2a$10$Xm/P9P1L2V3O/7.A6Xq//e/oT8vQKqW6X2r5m8H8wK7zH6Z2z6z5S'
-- So you can use 'password123' to login as admin or warga initially.

INSERT INTO users (username, password, role) VALUES
('admin_rt', '$2a$10$vI8aWBnW3fID.ZQ4/zo1G.q1lRps.9cGLcZEiGDI//5RxEIYcU12q', 'admin'),
('warga_budi', '$2a$10$vI8aWBnW3fID.ZQ4/zo1G.q1lRps.9cGLcZEiGDI//5RxEIYcU12q', 'warga');

-- The default password for both accounts above is: password123
