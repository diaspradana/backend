const express = require('express');
const router = express.Router();
const wargaController = require('../controllers/wargaController');

// Define route for warga tagihan
router.get('/tagihan', wargaController.getWargaTagihan);

// Define routes for warga financial transparency reports
router.get('/iuran', wargaController.getIuranList);
router.get('/pengeluaran', wargaController.getPengeluaranList);
router.get('/keuangan-summary', wargaController.getKeuanganSummary);

module.exports = router;
