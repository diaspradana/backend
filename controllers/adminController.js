const pool = require('../config/db');
const bcrypt = require('bcryptjs');

// Auto-migrate warga table
pool.query('ALTER TABLE warga ADD COLUMN username VARCHAR(50) UNIQUE').catch(() => {});

// Auto-migrate iuran table to make id_warga nullable for general income
pool.query('ALTER TABLE iuran MODIFY COLUMN id_warga INT NULL').catch((err) => {
  console.log('Migration info: iuran id_warga modify or error:', err.message);
});

pool.query('ALTER TABLE users ADD COLUMN password_plain VARCHAR(255)').catch(() => {});

// Auto-migrate users role to include rt and rw
pool.query(`ALTER TABLE users MODIFY COLUMN role ENUM('admin', 'warga', 'rt', 'rw') NOT NULL`).catch((err) => {
  console.log('Migration info: users table already updated or error:', err.message);
});

// Auto-migrate pengeluaran table to include status
pool.query(`ALTER TABLE pengeluaran ADD COLUMN status ENUM('menunggu_rt', 'menunggu_rw', 'disetujui', 'ditolak_rt', 'ditolak_rw') NOT NULL DEFAULT 'menunggu_rt'`).then(async () => {
  // If we successfully added the status column, set all existing records to 'disetujui' so they are not treated as pending
  await pool.query("UPDATE pengeluaran SET status = 'disetujui'").catch(() => {});
}).catch((err) => {
  console.log('Migration info: pengeluaran table already has status or error:', err.message);
});

// Auto-seed ketua_rt and ketua_rw accounts
const seedApproverUsers = async () => {
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPw = await bcrypt.hash('password123', salt);
    await pool.query(
      'INSERT IGNORE INTO users (username, password, password_plain, role) VALUES (?, ?, ?, ?)',
      ['ketua_rt', hashedPw, 'password123', 'rt']
    );
    await pool.query(
      'INSERT IGNORE INTO users (username, password, password_plain, role) VALUES (?, ?, ?, ?)',
      ['ketua_rw', hashedPw, 'password123', 'rw']
    );
  } catch (err) {
    console.error('Error auto-seeding approver users:', err);
  }
};
// Run seed function after a short delay to ensure db is ready
setTimeout(seedApproverUsers, 1000);

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
    // Iuran warga: hanya yang terkait dengan warga (id_warga IS NOT NULL)
    const [totalIuranWarga] = await pool.query('SELECT SUM(jumlah) as total FROM iuran WHERE id_warga IS NOT NULL');
    // Pemasukan umum: entri tanpa id_warga (pemasukan non-iuran)
    const [totalPemasukanUmum] = await pool.query('SELECT SUM(jumlah) as total FROM iuran WHERE id_warga IS NULL');
    // Pengeluaran yang telah disetujui penuh (status disetujui)
    const [totalPengeluaran] = await pool.query("SELECT SUM(jumlah) as total FROM pengeluaran WHERE status = 'disetujui'");

    const iuranWarga = parseFloat(totalIuranWarga[0].total || 0);
    const pemasukanUmum = parseFloat(totalPemasukanUmum[0].total || 0);
    const totalIuran = iuranWarga + pemasukanUmum; // total semua pemasukan
    const pengeluaran = parseFloat(totalPengeluaran[0].total || 0);
    // Saldo KAS = (Iuran Warga + Pemasukan Umum) - Pengeluaran Disetujui
    const saldo = totalIuran - pengeluaran;

    res.json({
      totalWarga: wargaCount[0].total,
      totalIuran: totalIuran,         // total semua pemasukan
      totalIuranWarga: iuranWarga,    // hanya iuran warga
      totalPemasukanUmum: pemasukanUmum, // hanya pemasukan umum
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
      pengeluaranQuery = "SELECT YEAR(tanggal) as label, SUM(jumlah) as total FROM pengeluaran WHERE status = 'disetujui' GROUP BY YEAR(tanggal) ORDER BY label ASC LIMIT 5";
    } else if (period === 'monthly') {
      // Get data for current year months
      iuranQuery = 'SELECT MONTH(tanggal) as label, SUM(jumlah) as total FROM iuran WHERE YEAR(tanggal) = YEAR(CURRENT_DATE()) GROUP BY MONTH(tanggal) ORDER BY label ASC';
      pengeluaranQuery = "SELECT MONTH(tanggal) as label, SUM(jumlah) as total FROM pengeluaran WHERE status = 'disetujui' AND YEAR(tanggal) = YEAR(CURRENT_DATE()) GROUP BY MONTH(tanggal) ORDER BY label ASC";
    } else { // weekly by default
      // For simplicity, we just taking last 7 records or grouping by day for current week
      iuranQuery = 'SELECT DAYNAME(tanggal) as label, SUM(jumlah) as total FROM iuran WHERE YEARWEEK(tanggal, 1) = YEARWEEK(CURRENT_DATE(), 1) GROUP BY DAYNAME(tanggal), DAYOFWEEK(tanggal) ORDER BY DAYOFWEEK(tanggal) ASC';
      pengeluaranQuery = "SELECT DAYNAME(tanggal) as label, SUM(jumlah) as total FROM pengeluaran WHERE status = 'disetujui' AND YEARWEEK(tanggal, 1) = YEARWEEK(CURRENT_DATE(), 1) GROUP BY DAYNAME(tanggal), DAYOFWEEK(tanggal) ORDER BY DAYOFWEEK(tanggal) ASC";
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
       LEFT JOIN warga w ON i.id_warga = w.id 
       ORDER BY i.tanggal DESC, i.id DESC`
    );
    res.json(iuran);
  } catch (error) {
    console.error('Error fetching iuran list:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.addIuran = async (req, res) => {
  const { id_warga, jumlah, tanggal, keterangan } = req.body;
  try {
    if (!jumlah || !tanggal) {
      return res.status(400).json({ message: 'Jumlah dan tanggal wajib diisi' });
    }
    const [result] = await pool.query(
      'INSERT INTO iuran (id_warga, jumlah, tanggal, keterangan) VALUES (?, ?, ?, ?)',
      [id_warga || null, jumlah, tanggal, keterangan || null]
    );
    res.status(201).json({ message: 'Pemasukan berhasil ditambahkan', id: result.insertId });
  } catch (error) {
    console.error('Error adding iuran:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updateIuran = async (req, res) => {
  const { id } = req.params;
  const { id_warga, jumlah, tanggal, keterangan } = req.body;
  try {
    if (!jumlah || !tanggal) {
      return res.status(400).json({ message: 'Jumlah dan tanggal wajib diisi' });
    }
    // Check if system locked
    const [rows] = await pool.query('SELECT keterangan FROM iuran WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Pemasukan tidak ditemukan' });
    }
    if (rows[0].keterangan && rows[0].keterangan.includes('Iuran Berkala Bulan')) {
      return res.status(400).json({ message: 'Pemasukan otomatis sistem tidak dapat diubah' });
    }

    await pool.query(
      'UPDATE iuran SET id_warga = ?, jumlah = ?, tanggal = ?, keterangan = ? WHERE id = ?',
      [id_warga || null, jumlah, tanggal, keterangan || null, id]
    );
    res.json({ message: 'Pemasukan berhasil diperbarui' });
  } catch (error) {
    console.error('Error updating iuran:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.deleteIuran = async (req, res) => {
  const { id } = req.params;
  try {
    // Check if system locked
    const [rows] = await pool.query('SELECT keterangan FROM iuran WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Pemasukan tidak ditemukan' });
    }
    if (rows[0].keterangan && rows[0].keterangan.includes('Iuran Berkala Bulan')) {
      return res.status(400).json({ message: 'Pemasukan otomatis sistem tidak dapat dihapus' });
    }

    await pool.query('DELETE FROM iuran WHERE id = ?', [id]);
    res.json({ message: 'Pemasukan berhasil dihapus' });
  } catch (error) {
    console.error('Error deleting iuran:', error);
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
      "INSERT INTO pengeluaran (jumlah, tanggal, keterangan, status) VALUES (?, ?, ?, 'menunggu_rt')",
      [jumlah, tanggal, keterangan || null]
    );
    res.status(201).json({ message: 'Pengajuan dana berhasil ditambahkan', id: result.insertId });
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
      "UPDATE pengeluaran SET jumlah = ?, tanggal = ?, keterangan = ?, status = 'menunggu_rt' WHERE id = ?",
      [jumlah, tanggal, keterangan || null, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Pengeluaran not found' });
    }
    res.json({ message: 'Pengajuan dana berhasil diperbarui dan dikirim ulang untuk persetujuan' });
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

exports.getPendingPengajuanDana = async (req, res) => {
  const { role } = req.query; // 'rt' or 'rw'
  try {
    if (!role) {
      return res.status(400).json({ message: 'Role is required' });
    }

    let status = '';
    if (role === 'rt') status = 'menunggu_rt';
    else if (role === 'rw') status = 'menunggu_rw';
    else {
      return res.status(400).json({ message: 'Invalid role for pending fund requests' });
    }

    const [pengajuan] = await pool.query(
      'SELECT * FROM pengeluaran WHERE status = ? ORDER BY tanggal DESC, id DESC',
      [status]
    );
    res.json(pengajuan);
  } catch (error) {
    console.error('Error fetching pending pengajuan dana:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.approvePengajuanDana = async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  try {
    if (!role) {
      return res.status(400).json({ message: 'Role is required' });
    }

    const [rows] = await pool.query('SELECT status FROM pengeluaran WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Pengajuan dana tidak ditemukan' });
    }

    const currentStatus = rows[0].status;
    let nextStatus = '';

    if (role === 'rt') {
      if (currentStatus !== 'menunggu_rt') {
        return res.status(400).json({ message: 'Status pengajuan tidak valid untuk disetujui oleh RT' });
      }
      nextStatus = 'menunggu_rw';
    } else if (role === 'rw') {
      if (currentStatus !== 'menunggu_rw') {
        return res.status(400).json({ message: 'Status pengajuan tidak valid untuk disetujui oleh RW' });
      }
      nextStatus = 'disetujui';
    } else {
      return res.status(400).json({ message: 'Role tidak memiliki izin persetujuan' });
    }

    await pool.query('UPDATE pengeluaran SET status = ? WHERE id = ?', [nextStatus, id]);
    res.json({ message: 'Pengajuan dana berhasil disetujui', status: nextStatus });
  } catch (error) {
    console.error('Error approving pengajuan dana:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.rejectPengajuanDana = async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  try {
    if (!role) {
      return res.status(400).json({ message: 'Role is required' });
    }

    const [rows] = await pool.query('SELECT status FROM pengeluaran WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Pengajuan dana tidak ditemukan' });
    }

    const currentStatus = rows[0].status;
    let nextStatus = '';

    if (role === 'rt') {
      if (currentStatus !== 'menunggu_rt') {
        return res.status(400).json({ message: 'Status pengajuan tidak valid untuk ditolak oleh RT' });
      }
      nextStatus = 'ditolak_rt';
    } else if (role === 'rw') {
      if (currentStatus !== 'menunggu_rw') {
        return res.status(400).json({ message: 'Status pengajuan tidak valid untuk ditolak oleh RW' });
      }
      nextStatus = 'ditolak_rw';
    } else {
      return res.status(400).json({ message: 'Role tidak memiliki izin persetujuan' });
    }

    await pool.query('UPDATE pengeluaran SET status = ? WHERE id = ?', [nextStatus, id]);
    res.json({ message: 'Pengajuan dana berhasil ditolak', status: nextStatus });
  } catch (error) {
    console.error('Error rejecting pengajuan dana:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

