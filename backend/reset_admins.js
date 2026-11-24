// [FLAGGED / DEPRECATED] Legacy MongoDB admin reset script. The application uses SQLite via backend/db.js by default. Kept for backwards compatibility.
const mongoose = require('mongoose');
require('dotenv').config();

async function resetAdmins() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');
        
        await mongoose.connection.db.collection('admins').deleteMany({});
        console.log('Admins collection cleared');
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

resetAdmins();
