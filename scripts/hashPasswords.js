// const pool = require('../models/db');
// const bcrypt = require('bcrypt');

// const hashPasswords = async () => {
//   try {
//     const res = await pool.query('SELECT id, password FROM admins');
//     for (const admin of res.rows) {
//       if (!admin.password.startsWith('$2b$')) {
//         const hashed = await bcrypt.hash(admin.password, 10);
//         await pool.query('UPDATE admins SET password = $1 WHERE id = $2', [hashed, admin.id]);
//       }
//     }
//     console.log('✅ Passwords hashed!');
//   } catch (error) {
//     console.error('Error hashing passwords:', error);
//   } finally {
//     await pool.end();
//     process.exit();
//   }
// };

// hashPasswords();

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