const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const wargaRoutes = require('./routes/wargaRoutes');

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors()); // Allow requests from any origin
app.use(express.json()); // Parse JSON bodies

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/warga', wargaRoutes);

app.get('/', (req, res) => {
  res.send('API RT RW RUNNING 🚀');
});

// Detailed error handling for unhandled routes
app.use((req, res, next) => {
  res.status(404).json({ message: 'Endpoint not found' });
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
