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
router.post('/iuran', adminController.addIuran);
router.put('/iuran/:id', adminController.updateIuran);
router.delete('/iuran/:id', adminController.deleteIuran);
router.get('/pengeluaran', adminController.getPengeluaranList);
router.post('/pengeluaran', adminController.addPengeluaran);
router.put('/pengeluaran/:id', adminController.updatePengeluaran);
router.delete('/pengeluaran/:id', adminController.deletePengeluaran);

// Fund Request Approval routes
router.get('/pengajuan-dana/pending', adminController.getPendingPengajuanDana);
router.put('/pengajuan-dana/:id/approve', adminController.approvePengajuanDana);
router.put('/pengajuan-dana/:id/reject', adminController.rejectPengajuanDana);

module.exports = router;
