const pool = require('../config/db');

async function setupDatabase() {
  try {
    // 1. Create warga table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS warga (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nama VARCHAR(100) NOT NULL,
        nik VARCHAR(20) NOT NULL,
        alamat TEXT,
        no_hp VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Create iuran table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS iuran (
        id INT AUTO_INCREMENT PRIMARY KEY,
        id_warga INT NOT NULL,
        jumlah DECIMAL(15,2) NOT NULL,
        tanggal DATE NOT NULL,
        keterangan VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (id_warga) REFERENCES warga(id) ON DELETE CASCADE
      )
    `);

    // 3. Create pengeluaran table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pengeluaran (
        id INT AUTO_INCREMENT PRIMARY KEY,
        jumlah DECIMAL(15,2) NOT NULL,
        tanggal DATE NOT NULL,
        keterangan VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 4. Check if we need to seed data
    const [wargaRows] = await pool.query('SELECT COUNT(*) as count FROM warga');
    if (wargaRows[0].count === 0) {
      console.log('Seeding initial data...');
      
      // Insert dummy warga
      const [wargaResult] = await pool.query(`
        INSERT INTO warga (nama, nik, alamat, no_hp) VALUES 
        ('Budi Santoso', '3200111122223333', 'Jl. Merdeka No 1', '081234567890'),
        ('Siti Aminah', '3200111122223334', 'Jl. Merdeka No 2', '081234567891'),
        ('Agus Setiawan', '3200111122223335', 'Jl. Merdeka No 3', '081234567892')
      `);
      
      const insertId = wargaResult.insertId;

      // Ensure we use realistic past dates for charts (e.g., this month, last month)
      const now = new Date();
      const thisMonth = now.toISOString().slice(0, 10);
      now.setMonth(now.getMonth() - 1);
      const lastMonth = now.toISOString().slice(0, 10);

      // Insert dummy iuran
      await pool.query(`
        INSERT INTO iuran (id_warga, jumlah, tanggal, keterangan) VALUES 
        (?, 50000, ?, 'Iuran Keamanan'),
        (?, 50000, ?, 'Iuran Kebersihan'),
        (?, 75000, ?, 'Iuran Bantuan Sosial'),
        (?, 50000, ?, 'Iuran Keamanan')
      `, [insertId, thisMonth, insertId + 1, thisMonth, insertId + 2, lastMonth, insertId, lastMonth]);

      // Insert dummy pengeluaran
      await pool.query(`
        INSERT INTO pengeluaran (jumlah, tanggal, keterangan) VALUES 
        (100000, ?, 'Bayar Satpam'),
        (30000, ?, 'Beli Sapu dan Trashbag'),
        (50000, ?, 'Perbaikan Lampu Jalan')
      `, [thisMonth, thisMonth, lastMonth]);

      console.log('Seeding complete.');
    } else {
      console.log('Data already exists, skipping seed.');
    }

    console.log('Database setup complete.');
    process.exit(0);
  } catch (error) {
    console.error('Error setting up database:', error);
    process.exit(1);
  }
}

setupDatabase();
