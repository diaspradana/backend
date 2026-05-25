const pool = require('../config/db');
const bcrypt = require('bcryptjs');

// Auto-migrate warga table
pool.query('ALTER TABLE warga ADD COLUMN username VARCHAR(50) UNIQUE').catch(() => {});
pool.query('ALTER TABLE users ADD COLUMN password_plain VARCHAR(255)').catch(() => {});

// Auto-migrate tagihan_berkala table
pool.query(`
  CREATE TABLE IF NOT EXISTS tagihan_berkala (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_warga INT NOT NULL,
    bulan VARCHAR(7) NOT NULL,
    jumlah DECIMAL(15,2) NOT NULL DEFAULT 50000.00,
    status ENUM('lunas', 'belum_lunas') NOT NULL DEFAULT 'belum_lunas',
    tanggal_bayar DATE DEFAULT NULL,
    denda DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_warga) REFERENCES warga(id) ON DELETE CASCADE,
    UNIQUE KEY unique_warga_bulan (id_warga, bulan)
  )
`).catch((err) => console.error('Error creating tagihan_berkala table:', err));

exports.getDashboardSummary = async (req, res) => {
  try {
    const [wargaCount] = await pool.query('SELECT COUNT(*) as total FROM warga');
    const [totalIuran] = await pool.query('SELECT SUM(jumlah) as total FROM iuran');
    const [totalPengeluaran] = await pool.query('SELECT SUM(jumlah) as total FROM pengeluaran');

    const iuran = totalIuran[0].total || 0;
    const pengeluaran = totalPengeluaran[0].total || 0;
    const saldo = iuran - pengeluaran;

    res.json({
      totalWarga: wargaCount[0].total,
      totalIuran: iuran,
      totalPengeluaran: pengeluaran,
      saldoKas: saldo
    });
  } catch (error) {
    console.error('Error fetching dashboard summary:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getDashboardCharts = async (req, res) => {
  const { period } = req.query; // weekly, monthly, yearly

  try {
    let iuranQuery = '';
    let pengeluaranQuery = '';

    if (period === 'yearly') {
      iuranQuery = 'SELECT YEAR(tanggal) as label, SUM(jumlah) as total FROM iuran GROUP BY YEAR(tanggal) ORDER BY label ASC LIMIT 5';
      pengeluaranQuery = 'SELECT YEAR(tanggal) as label, SUM(jumlah) as total FROM pengeluaran GROUP BY YEAR(tanggal) ORDER BY label ASC LIMIT 5';
    } else if (period === 'monthly') {
      // Get data for current year months
      iuranQuery = 'SELECT MONTH(tanggal) as label, SUM(jumlah) as total FROM iuran WHERE YEAR(tanggal) = YEAR(CURRENT_DATE()) GROUP BY MONTH(tanggal) ORDER BY label ASC';
      pengeluaranQuery = 'SELECT MONTH(tanggal) as label, SUM(jumlah) as total FROM pengeluaran WHERE YEAR(tanggal) = YEAR(CURRENT_DATE()) GROUP BY MONTH(tanggal) ORDER BY label ASC';
    } else { // weekly by default
      // For simplicity, we just taking last 7 records or grouping by day for current week
      iuranQuery = 'SELECT DAYNAME(tanggal) as label, SUM(jumlah) as total FROM iuran WHERE YEARWEEK(tanggal, 1) = YEARWEEK(CURRENT_DATE(), 1) GROUP BY DAYNAME(tanggal), DAYOFWEEK(tanggal) ORDER BY DAYOFWEEK(tanggal) ASC';
      pengeluaranQuery = 'SELECT DAYNAME(tanggal) as label, SUM(jumlah) as total FROM pengeluaran WHERE YEARWEEK(tanggal, 1) = YEARWEEK(CURRENT_DATE(), 1) GROUP BY DAYNAME(tanggal), DAYOFWEEK(tanggal) ORDER BY DAYOFWEEK(tanggal) ASC';
    }

    const [iuranData] = await pool.query(iuranQuery);
    const [pengeluaranData] = await pool.query(pengeluaranQuery);

    res.json({
      iuran: iuranData,
      pengeluaran: pengeluaranData
    });

  } catch (error) {
      console.error('Error fetching chart data:', error);
      res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getWargaData = async (req, res) => {
  try {
    const [warga] = await pool.query('SELECT w.*, u.username, u.password_plain FROM warga w LEFT JOIN users u ON w.username = u.username ORDER BY w.created_at DESC');
    res.json(warga);
  } catch (error) {
    console.error('Error fetching warga data:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.addWarga = async (req, res) => {
  const { nama, nik, alamat, no_hp, username, password } = req.body;
  try {
    if (!nama || !nik) {
      return res.status(400).json({ message: 'Nama and NIK are required' });
    }

    if (username && password) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      // Create user
      await pool.query('INSERT INTO users (username, password, password_plain, role) VALUES (?, ?, ?, ?)', [username, hashedPassword, password, 'warga']);
    }

    const [result] = await pool.query(
      'INSERT INTO warga (nama, nik, alamat, no_hp, username) VALUES (?, ?, ?, ?, ?)', 
      [nama, nik, alamat, no_hp, username || null]
    );
    res.status(201).json({ message: 'Warga added successfully', id: result.insertId });
  } catch (error) {
    console.error('Error adding warga:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updateWarga = async (req, res) => {
  const { nik: nikParam } = req.params;
  const { nama, nik, alamat, no_hp, username, password } = req.body;
  try {
    if (username && password) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      // Check if user exists
      const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
      if (existing.length > 0) {
        await pool.query('UPDATE users SET password = ?, password_plain = ? WHERE username = ?', [hashedPassword, password, username]);
      } else {
        await pool.query('INSERT INTO users (username, password, password_plain, role) VALUES (?, ?, ?, ?)', [username, hashedPassword, password, 'warga']);
      }
    }

    await pool.query('UPDATE warga SET nama=?, nik=?, alamat=?, no_hp=?, username=? WHERE nik=?', [nama, nik, alamat, no_hp, username || null, nikParam]);
    res.json({ message: 'Warga updated successfully' });
  } catch (error) {
    console.error('Error updating warga:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.deleteWarga = async (req, res) => {
  const { nik } = req.params;
  try {
    const [wargaData] = await pool.query('SELECT username FROM warga WHERE nik=?', [nik]);
    if (wargaData.length > 0 && wargaData[0].username) {
       await pool.query('DELETE FROM users WHERE username=?', [wargaData[0].username]);
    }
    await pool.query('DELETE FROM warga WHERE nik=?', [nik]);
    res.json({ message: 'Warga deleted successfully' });
  } catch (error) {
    console.error('Error deleting warga:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const generateMonthlyBills = async () => {
  try {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Get all wargas
    const [wargas] = await pool.query('SELECT id FROM warga');

    // Insert bills for current month for all wargas
    for (const warga of wargas) {
      await pool.query(
        'INSERT IGNORE INTO tagihan_berkala (id_warga, bulan, jumlah, status, denda) VALUES (?, ?, 50000.00, \'belum_lunas\', 0.00)',
        [warga.id, currentMonth]
      ).catch(err => console.error('Error auto-generating bill:', err));
    }
  } catch (error) {
    console.error('Error in generateMonthlyBills:', error);
  }
};

const calculateDynamicDenda = (bill) => {
  if (bill.status === 'lunas') {
    return parseFloat(bill.denda || 0);
  }
  const currentDate = new Date();
  const [year, month] = bill.bulan.split('-');
  const dueDate = new Date(parseInt(year), parseInt(month) - 1, 3); // due date is 3rd of the month

  currentDate.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);

  if (currentDate > dueDate) {
    const diffTime = Math.abs(currentDate - dueDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays * 2000;
  }
  return 0;
};

exports.getTagihan = async (req, res) => {
  try {
    await generateMonthlyBills();

    const [tagihan] = await pool.query(
      'SELECT t.*, w.nama, w.nik, w.no_hp FROM tagihan_berkala t JOIN warga w ON t.id_warga = w.id ORDER BY t.bulan DESC, w.nama ASC'
    );

    const result = tagihan.map(t => {
      const dynamicDenda = calculateDynamicDenda(t);
      return {
        ...t,
        denda: dynamicDenda
      };
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching tagihan:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.bayarTagihan = async (req, res) => {
  const { id } = req.params;
  try {
    const [billRows] = await pool.query('SELECT * FROM tagihan_berkala WHERE id = ?', [id]);
    if (billRows.length === 0) {
      return res.status(404).json({ message: 'Tagihan tidak ditemukan' });
    }

    const bill = billRows[0];
    if (bill.status === 'lunas') {
      return res.status(400).json({ message: 'Tagihan sudah lunas' });
    }

    const denda = calculateDynamicDenda(bill);
    const totalAmount = parseFloat(bill.jumlah) + denda;

    await pool.query(
      'UPDATE tagihan_berkala SET status = \'lunas\', tanggal_bayar = CURRENT_DATE(), denda = ? WHERE id = ?',
      [denda, id]
    );

    await pool.query(
      'INSERT INTO iuran (id_warga, jumlah, tanggal, keterangan) VALUES (?, ?, CURRENT_DATE(), ?)',
      [bill.id_warga, totalAmount, `Iuran Berkala Bulan ${bill.bulan} (Denda: Rp ${denda.toLocaleString('id-ID')})`]
    );

    res.json({ message: 'Pembayaran tagihan berhasil dicatat', denda, totalAmount });
  } catch (error) {
    console.error('Error paying tagihan:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Export helpers for other controllers (like warga controller)
exports.generateMonthlyBills = generateMonthlyBills;
exports.calculateDynamicDenda = calculateDynamicDenda;

exports.getIuranList = async (req, res) => {
  try {
    const [iuran] = await pool.query(
      `SELECT i.*, w.nama, w.nik, w.no_hp, w.alamat 
       FROM iuran i 
       JOIN warga w ON i.id_warga = w.id 
       ORDER BY i.tanggal DESC, i.id DESC`
    );
    res.json(iuran);
  } catch (error) {
    console.error('Error fetching iuran list:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getPengeluaranList = async (req, res) => {
  try {
    const [pengeluaran] = await pool.query(
      'SELECT * FROM pengeluaran ORDER BY tanggal DESC, id DESC'
    );
    res.json(pengeluaran);
  } catch (error) {
    console.error('Error fetching pengeluaran list:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.addPengeluaran = async (req, res) => {
  const { jumlah, tanggal, keterangan } = req.body;
  try {
    if (!jumlah || !tanggal) {
      return res.status(400).json({ message: 'Jumlah and tanggal are required' });
    }
    const [result] = await pool.query(
      'INSERT INTO pengeluaran (jumlah, tanggal, keterangan) VALUES (?, ?, ?)',
      [jumlah, tanggal, keterangan || null]
    );
    res.status(201).json({ message: 'Pengeluaran added successfully', id: result.insertId });
  } catch (error) {
    console.error('Error adding pengeluaran:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updatePengeluaran = async (req, res) => {
  const { id } = req.params;
  const { jumlah, tanggal, keterangan } = req.body;
  try {
    if (!jumlah || !tanggal) {
      return res.status(400).json({ message: 'Jumlah and tanggal are required' });
    }
    const [result] = await pool.query(
      'UPDATE pengeluaran SET jumlah = ?, tanggal = ?, keterangan = ? WHERE id = ?',
      [jumlah, tanggal, keterangan || null, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Pengeluaran not found' });
    }
    res.json({ message: 'Pengeluaran updated successfully' });
  } catch (error) {
    console.error('Error updating pengeluaran:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.deletePengeluaran = async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await pool.query('DELETE FROM pengeluaran WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Pengeluaran not found' });
    }
    res.json({ message: 'Pengeluaran deleted successfully' });
  } catch (error) {
    console.error('Error deleting pengeluaran:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

