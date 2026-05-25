const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// Define routes for admin dashboard
router.get('/dashboard-summary', adminController.getDashboardSummary);
router.get('/dashboard-chart-data', adminController.getDashboardCharts);
router.get('/warga', adminController.getWargaData);
router.post('/warga', adminController.addWarga);
router.put('/warga/:nik', adminController.updateWarga);
router.delete('/warga/:nik', adminController.deleteWarga);

// Periodic billing routes
router.get('/tagihan', adminController.getTagihan);
router.put('/tagihan/:id/bayar', adminController.bayarTagihan);

// Financial reports routes
router.get('/iuran', adminController.getIuranList);
router.get('/pengeluaran', adminController.getPengeluaranList);
router.post('/pengeluaran', adminController.addPengeluaran);
router.put('/pengeluaran/:id', adminController.updatePengeluaran);
router.delete('/pengeluaran/:id', adminController.deletePengeluaran);

module.exports = router;
