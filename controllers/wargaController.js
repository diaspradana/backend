const pool = require('../config/db');
const adminController = require('./adminController');

exports.getWargaTagihan = async (req, res) => {
  const { username } = req.query;
  try {
    if (!username) {
      return res.status(400).json({ message: 'Username is required' });
    }

    // Auto-generate bills for current month for all wargas
    await adminController.generateMonthlyBills();

    // Query bills for this specific warga based on username
    const [tagihan] = await pool.query(
      `SELECT t.*, w.nama, w.nik, w.no_hp 
       FROM tagihan_berkala t 
       JOIN warga w ON t.id_warga = w.id 
       JOIN users u ON w.username = u.username 
       WHERE u.username = ? 
       ORDER BY t.bulan DESC`,
      [username]
    );

    // Calculate dynamic denda for unpaid ones
    const result = tagihan.map(t => {
      const dynamicDenda = adminController.calculateDynamicDenda(t);
      return {
        ...t,
        denda: dynamicDenda
      };
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching warga tagihan:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

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
    console.error('Error fetching warga iuran list:', error);
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
    console.error('Error fetching warga pengeluaran list:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getKeuanganSummary = async (req, res) => {
  try {
    const [totalIuran] = await pool.query('SELECT SUM(jumlah) as total FROM iuran');
    const [totalPengeluaran] = await pool.query('SELECT SUM(jumlah) as total FROM pengeluaran');

    const iuran = parseFloat(totalIuran[0].total) || 0;
    const pengeluaran = parseFloat(totalPengeluaran[0].total) || 0;
    const saldo = iuran - pengeluaran;

    res.json({
      totalIuran: iuran,
      totalPengeluaran: pengeluaran,
      saldoKas: saldo
    });
  } catch (error) {
    console.error('Error fetching keuangan summary:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

