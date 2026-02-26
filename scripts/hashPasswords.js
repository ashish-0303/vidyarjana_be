
import { sql, connectToMSSQL } from '../models/db.js';
import bcrypt from 'bcrypt';

const hashPasswords = async () => {
  try {
    const pool = await connectToMSSQL(); // Initialize the pool

    const res = await pool.request().query('SELECT id, password FROM admins');
    for (const admin of res.recordset) {
      if (!admin.password.startsWith('$2b$')) {
        const hashed = await bcrypt.hash(admin.password, 10);
        await pool.request()
          .input('password', sql.VarChar, hashed)
          .input('id', sql.Int, admin.id)
          .query('UPDATE admins SET password = @password WHERE id = @id');
      }
    }
    console.log('✅ Passwords hashed!');
  } catch (error) {
    console.error('Error hashing passwords:', error);
  } finally {
    const pool = await connectToMSSQL();
    await pool.close();
    process.exit();
  }
};

hashPasswords();